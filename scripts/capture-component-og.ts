/**
 * Photographs each library component for its share image.
 *
 *   corepack pnpm og:components            # every component
 *   corepack pnpm og:components draw-a-line # just one
 *
 * Starts the Vite dev server, opens /components/<slug>?og=1 in headless Chrome (your own install;
 * set CHROME_PATH if it isn't in the usual place), waits for the page to signal it's ready, and
 * saves a 1200 × 630 PNG to public/og/components/<slug>.png. It then rewrites
 * shared/component-og.ts with a short hash of each picture so share links refresh when one changes.
 * No packages beyond what the project already uses.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "public", "og", "components");
const manifest = path.join(root, "shared", "component-og.ts");
const WIDTH = 1200;
const HEIGHT = 630;
const READY_TIMEOUT_MS = 30_000;

function chromePath() {
  const candidates = [
    process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter((candidate): candidate is string => Boolean(candidate));
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) throw new Error("Chrome wasn't found. Set CHROME_PATH to your Chrome or Chromium executable.");
  return found;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** A tiny Chrome DevTools Protocol client over the page's WebSocket. */
async function connect(port: number) {
  let target: { webSocketDebuggerUrl: string } | undefined;
  for (let attempt = 0; attempt < 50 && !target; attempt++) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json() as { type: string; webSocketDebuggerUrl: string }[];
      target = targets.find((entry) => entry.type === "page");
    } catch {
      // Chrome is still starting.
    }
    if (!target) await sleep(200);
  }
  if (!target) throw new Error("Couldn't reach headless Chrome.");
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
  let id = 0;
  const pending = new Map<number, (message: { result?: Record<string, unknown>; error?: { message: string } }) => void>();
  const errors: string[] = [];
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    if (message.id && pending.has(message.id)) { pending.get(message.id)!(message); pending.delete(message.id); }
    if (message.method === "Runtime.exceptionThrown") errors.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
  });
  const send = (method: string, params: Record<string, unknown> = {}) => new Promise<Record<string, unknown>>((resolve, reject) => {
    const call = ++id;
    pending.set(call, (message) => (message.error ? reject(new Error(`${method}: ${message.error.message}`)) : resolve(message.result ?? {})));
    socket.send(JSON.stringify({ id: call, method, params }));
  });
  return { send, errors, close: () => socket.close() };
}

async function main() {
  const only = process.argv.slice(2);
  const server = await createServer({ root, logLevel: "warn", server: { port: 5390, strictPort: false } });
  await server.listen();
  const base = server.resolvedUrls?.local[0] ?? "http://localhost:5390/";
  const profile = mkdtempSync(path.join(tmpdir(), "opencircle-og-"));
  let chrome: ChildProcess | undefined;
  try {
    const { COMPONENT_META } = await server.ssrLoadModule("/shared/component-meta.ts") as typeof import("../shared/component-meta");
    const { COMPONENT_SCREENSHOTS } = await server.ssrLoadModule("/shared/component-og.ts") as typeof import("../shared/component-og");
    const slugs = COMPONENT_META.map((component) => component.slug).filter((slug) => !only.length || only.includes(slug));
    const unknown = only.filter((slug) => !COMPONENT_META.some((component) => component.slug === slug));
    if (unknown.length) throw new Error(`Unknown component: ${unknown.join(", ")}`);

    const port = 9300 + Math.floor(Math.random() * 400);
    chrome = spawn(chromePath(), ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--no-first-run", "--hide-scrollbars", "--force-color-profile=srgb", "--enable-unsafe-swiftshader", "about:blank"], { stdio: "ignore" });
    const page = await connect(port);
    await page.send("Page.enable");
    await page.send("Runtime.enable");
    await page.send("Emulation.setDeviceMetricsOverride", { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: false });
    await page.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });

    mkdirSync(output, { recursive: true });
    const hashes: Record<string, string> = { ...COMPONENT_SCREENSHOTS };
    for (const slug of slugs) {
      await page.send("Page.navigate", { url: new URL(`components/${slug}?og=1`, base).href });
      const started = Date.now();
      let ready = false;
      while (!ready && Date.now() - started < READY_TIMEOUT_MS) {
        await sleep(250);
        const result = await page.send("Runtime.evaluate", { expression: "window.__ogReady === true", returnByValue: true }) as { result?: { value?: boolean } };
        ready = result.result?.value === true;
      }
      if (!ready) throw new Error(`${slug} didn't signal it was ready within ${READY_TIMEOUT_MS / 1000}s.${page.errors.length ? ` Page errors: ${page.errors.join(" | ")}` : ""}`);
      const shot = await page.send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT, scale: 1 } }) as { data: string };
      const bytes = Buffer.from(shot.data, "base64");
      writeFileSync(path.join(output, `${slug}.png`), bytes);
      hashes[slug] = createHash("sha256").update(bytes).digest("hex").slice(0, 12);
      console.log(`${slug}: public/og/components/${slug}.png (${Math.round(bytes.length / 1024)} KB)`);
    }
    page.close();

    const current = readFileSync(manifest, "utf8");
    const entries = Object.keys(hashes).sort().map((slug) => `  ${JSON.stringify(slug)}: ${JSON.stringify(hashes[slug])},`).join("\n");
    const next = current.replace(/export const COMPONENT_SCREENSHOTS[^=]*= \{[\s\S]*?\};/, `export const COMPONENT_SCREENSHOTS: Readonly<Record<string, string>> = {\n${entries}\n};`);
    writeFileSync(manifest, next);
    console.log(`Updated shared/component-og.ts for ${slugs.length} component${slugs.length === 1 ? "" : "s"}.`);
  } finally {
    // Let Chrome finish shutting down before removing its profile; it keeps writing to it as it exits.
    if (chrome && chrome.exitCode === null) {
      const exited = new Promise((resolve) => chrome!.once("exit", resolve));
      chrome.kill();
      await Promise.race([exited, sleep(5000)]);
    }
    await server.close();
    try {
      rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      console.warn(`Couldn't remove the temporary Chrome profile at ${profile}; it's safe to delete.`);
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
