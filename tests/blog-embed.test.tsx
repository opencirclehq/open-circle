import { forwardRef, useState } from "react";
import { createPortal } from "react-dom";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { BlogBody } from "../src/components/blog/blog-body";
import { BlogComposer } from "../src/components/blog/blog-composer";
import { EmbedDialog } from "../src/components/blog/embed-dialog";
import { placeEmbed } from "../src/components/blog/place-embed";
import { content } from "./helpers/blog-contract";

// Like the real editor's own dialogs, this stand-in renders a form in a portal.
vi.mock("../src/components/blog/markdown-editor", () => ({
  default: forwardRef<unknown, { value: string; onChange: (value: string, normalized: boolean) => void; labelledBy: string }>(({ value, onChange, labelledBy }, _ref) => <>
    <textarea aria-labelledby={labelledBy} value={value} onChange={(event) => onChange(event.target.value, false)} />
    {createPortal(<form><input aria-label="Link in an editor dialog" /></form>, document.body)}
  </>),
}));

const marker = "⟨embed 1a2b3c4d⟩";

it("puts an embed on its own line at the cursor, where the published page embeds it", () => {
  const markdown = placeEmbed(`Before the video. ${marker}After the video.`, marker, "https://youtu.be/dQw4w9WgXcQ")!;
  render(<BlogBody>{markdown}</BlogBody>);
  expect([...document.querySelectorAll(".blog-body > p")].map((p) => p.textContent)).toEqual(["Before the video.", "After the video."]);
  expect(document.querySelector("iframe")?.getAttribute("src")).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
});

it("removes the cursor marker on cancel, appends without a cursor, and keeps $ in links literal", () => {
  expect(placeEmbed(`Before. ${marker}After.`, marker, null)).toBe("Before. After.");
  expect(placeEmbed("No cursor here.", null, null)).toBeNull();
  expect(placeEmbed("No cursor here.\n", null, "https://youtu.be/dQw4w9WgXcQ")).toBe("No cursor here.\n\n<https://youtu.be/dQw4w9WgXcQ>\n");
  expect(placeEmbed(`A ${marker} B`, marker, "https://www.youtube.com/watch?v=dQw4w9WgXcQ&x=$&$1")).toBe("A \n\n<https://www.youtube.com/watch?v=dQw4w9WgXcQ&x=$&$1>\n\n B");
});

function Harness({ onDone, onOuterSubmit }: { onDone: (url: string | null) => void; onOuterSubmit: () => void }) {
  const [open, setOpen] = useState(true);
  return <form onSubmit={(event) => { event.preventDefault(); onOuterSubmit(); }}><EmbedDialog open={open} onOpenChange={setOpen} onDone={onDone} /></form>;
}

it("accepts only YouTube and Gist links, and pressing Enter never submits the surrounding post", async () => {
  const user = userEvent.setup();
  const onDone = vi.fn();
  const onOuterSubmit = vi.fn();
  render(<Harness onDone={onDone} onOuterSubmit={onOuterSubmit} />);
  await user.type(screen.getByLabelText("Link"), "https://vimeo.com/123456{Enter}");
  expect(screen.getByRole("alert").textContent).toMatch(/isn't a YouTube video or GitHub Gist link/);
  expect(onDone).not.toHaveBeenCalled();
  await user.clear(screen.getByLabelText("Link"));
  await user.type(screen.getByLabelText("Link"), "https://gist.github.com/octocat/6cad326836d38bd3a7ae{Enter}");
  expect(onOuterSubmit).not.toHaveBeenCalled();
  expect(onDone).toHaveBeenCalledWith("https://gist.github.com/octocat/6cad326836d38bd3a7ae");
});

it("reports a cancelled embed as null", async () => {
  const user = userEvent.setup();
  const onDone = vi.fn();
  render(<Harness onDone={onDone} onOuterSubmit={vi.fn()} />);
  await user.type(screen.getByLabelText("Link"), "https://youtu.be/dQw4w9WgXcQ");
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  expect(onDone).toHaveBeenCalledWith(null);
});

it("clears what is typed while the dialog fades out, so it is not there when it opens again", async () => {
  // jsdom runs no CSS animations. This gives the dialog an exit animation that
  // ends only when told to, as a browser's does once the fade finishes.
  const styles = window.getComputedStyle.bind(window);
  vi.spyOn(window, "getComputedStyle").mockImplementation((element, pseudo) => {
    const computed = styles(element, pseudo);
    if (element.getAttribute("role") !== "dialog") return computed;
    return new Proxy(computed, { get: (target, key) => {
      if (key === "animationName") return element.getAttribute("data-state") === "closed" ? "exit" : "enter";
      const value = Reflect.get(target, key);
      return typeof value === "function" ? value.bind(target) : value;
    } });
  });
  if (!globalThis.CSS?.escape) vi.stubGlobal("CSS", { escape: (value: string) => value });
  const user = userEvent.setup();
  const onDone = vi.fn();
  function Reopen() {
    const [open, setOpen] = useState(true);
    return <><button type="button" onClick={() => setOpen(true)}>Embed another</button><EmbedDialog open={open} onOpenChange={setOpen} onDone={onDone} /></>;
  }
  render(<Reopen />);
  await user.type(screen.getByLabelText("Link"), "https://youtu.be/dQw4w9WgXcQ{Enter}");
  const dialog = document.querySelector<HTMLElement>("[role=dialog]")!;
  expect(dialog.getAttribute("data-state")).toBe("closed");
  await user.type(screen.getByLabelText("Link"), "stray", { skipClick: true });
  const ended = new Event("animationend", { bubbles: true });
  Object.defineProperty(ended, "animationName", { value: "exit" });
  act(() => { dialog.dispatchEvent(ended); });
  expect(document.querySelector("[role=dialog]")).toBeNull();
  await waitFor(() => expect(onDone).toHaveBeenCalledWith("https://youtu.be/dQw4w9WgXcQ"));
  await user.click(screen.getByRole("button", { name: "Embed another" }));
  expect(screen.getByLabelText<HTMLInputElement>("Link").value).toBe("");
});

it("only submits the post from its own form, not from a dialog inside the editor", async () => {
  const user = userEvent.setup();
  const onSave = vi.fn().mockResolvedValue(true);
  const { title, summary, body } = content();
  render(<BlogComposer busy={false} onSave={onSave} onLeave={vi.fn()} />);
  // A complete post, so only the form check, not validation, can stop a stray submit.
  await user.type(screen.getByLabelText("Title"), title);
  await user.type(screen.getByLabelText("Summary"), summary);
  await user.click(await screen.findByLabelText("Post"));
  await user.paste(body);
  await user.click(screen.getByRole("combobox", { name: "Topic" }));
  await user.click(await screen.findByRole("option", { name: "Open source" }));
  await user.type(screen.getByLabelText("Link in an editor dialog"), "https://youtu.be/dQw4w9WgXcQ{Enter}");
  expect(onSave).not.toHaveBeenCalled();
  await user.type(screen.getByLabelText("Title"), "{Enter}");
  expect(onSave).toHaveBeenCalledTimes(1);
  expect(onSave.mock.calls[0]).toMatchObject(["submit", { title, topic: "Open source", canonicalUrl: null, repository: null }]);
});
