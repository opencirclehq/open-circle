import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import pkg from "./package.json";
import { devApi } from "./server/vite-dev-api";
import { seo } from "./server/vite-seo";
import { DEFAULT_SITE_URL } from "./shared/brand";

/** The npm package a bundled module comes from, read from its node_modules path. */
function packageOf(id: string): string | null {
  return /.*[\\/]node_modules[\\/]((?:@[^\\/]+[\\/])?[^\\/]+)/.exec(id)?.[1].replace("\\", "/") ?? null;
}
const among = (...names: string[]) => (name: string) => names.includes(name);
const EAGER_LANGUAGES = ["markdown", "html", "css", "javascript"];

// Shared vendor chunks every page loads, then the post editor's libraries, which
// only the writing page loads. The editor is split so no one chunk grows too large.
const CHUNKS: [string, (name: string) => boolean][] = [
  ["react", among("react", "react-dom", "scheduler", "react-router", "react-router-dom", "@remix-run/router", "@tanstack/react-query", "@tanstack/query-core")],
  ["motion", among("motion", "framer-motion", "motion-dom", "motion-utils")],
  ["metal", among("metal-fx")],
  // The app's Radix primitives and their helpers. Radix parts only the editor uses stay with the editor.
  ["primitives", among(
    "@radix-ui/primitive", "@radix-ui/react-arrow", "@radix-ui/react-avatar", "@radix-ui/react-collection", "@radix-ui/react-compose-refs",
    "@radix-ui/react-context", "@radix-ui/react-dialog", "@radix-ui/react-direction", "@radix-ui/react-dismissable-layer", "@radix-ui/react-focus-guards",
    "@radix-ui/react-focus-scope", "@radix-ui/react-id", "@radix-ui/react-popper", "@radix-ui/react-portal", "@radix-ui/react-presence",
    "@radix-ui/react-primitive", "@radix-ui/react-roving-focus", "@radix-ui/react-slot", "@radix-ui/react-switch", "@radix-ui/react-tabs",
    "@radix-ui/react-tooltip", "@radix-ui/react-use-callback-ref", "@radix-ui/react-use-controllable-state", "@radix-ui/react-use-effect-event",
    "@radix-ui/react-use-is-hydrated", "@radix-ui/react-use-layout-effect", "@radix-ui/react-use-size", "@radix-ui/react-visually-hidden",
    "@floating-ui/core", "@floating-ui/dom", "@floating-ui/react-dom", "@floating-ui/utils", "aria-hidden", "detect-node-es", "get-nonce",
    "react-remove-scroll", "react-remove-scroll-bar", "react-style-singleton", "tslib", "use-callback-ref", "use-sidecar",
  )],
  // The view, its state and their small helpers depend on nothing else, so the chunks below import it one way.
  ["editor-codemirror-view", among("@codemirror/view", "@codemirror/state", "style-mod", "w3c-keyname", "crelt", "@marijn/find-cluster-break")],
  // Markdown and the languages it embeds load with the editor; code block languages load on demand in their own chunks.
  // language-data, which starts those loads, stays with the editor: a manual chunk would take Vite's preload helper
  // with it, and every page needs that helper.
  ["editor-codemirror", (name) => among("codemirror", "cm6-theme-basic-light", "@lezer/common", "@lezer/lr", "@lezer/highlight")(name)
    || EAGER_LANGUAGES.some((language) => name === `@codemirror/lang-${language}` || name === `@lezer/${language}`)
    || (name.startsWith("@codemirror/") && !name.startsWith("@codemirror/lang-") && !["@codemirror/legacy-modes", "@codemirror/language-data"].includes(name))],
  ["editor-lexical", (name) => name === "lexical" || name.startsWith("@lexical/")],
];

// https://vite.dev/config/
export default defineConfig(({ mode, isSsrBuild }) => {
  // The dev API reads GITHUB_TOKEN, ADMIN_GITHUB_IDS etc. from process.env, like Vercel does.
  const env = loadEnv(mode, process.cwd(), "");
  for (const [key, value] of Object.entries(env)) process.env[key] ??= value;

  return {
    plugins: [react(), devApi(), ...(isSsrBuild ? [] : [seo(env.SITE_URL || DEFAULT_SITE_URL)])],
    // The server bundle serves dist/, so it needs no copy of public/.
    publicDir: isSsrBuild ? false : "public",
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
    },
    // Chunk splitting is for the browser bundle only; the Node server build
    // (pnpm build:server) keeps its dependencies external.
    build: isSsrBuild ? {} : {
      rollupOptions: {
        output: {
          manualChunks(id) {
            const name = packageOf(id);
            return name ? CHUNKS.find(([, packages]) => packages(name))?.[0] : undefined;
          },
        },
      },
    },
    server: {
      port: 5173,
      open: false,
    },
    preview: {
      port: 4173,
    },
    resolve: {
      alias: {
        "@shared": path.resolve(__dirname, "./shared"),
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
