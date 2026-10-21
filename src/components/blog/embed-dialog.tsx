import { useId, useRef, useState } from "react";
import { blogEmbed } from "@shared/blog";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { TextureButton } from "@/components/ui/texture-button";

/**
 * Asks for a YouTube or Gist link. It reports the link, or null when cancelled,
 * only once it has closed and handed focus back, so the editor can insert.
 */
export function EmbedDialog({ open, onOpenChange, onDone }: { open: boolean; onOpenChange: (open: boolean) => void; onDone: (url: string | null) => void }) {
  const id = useId();
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const chosen = useRef<string | null>(null);
  const close = () => onOpenChange(false);
  // Cleared once fully closed: the field still takes keystrokes while the dialog fades out.
  const closed = (event: Event) => { event.preventDefault(); const url = chosen.current; chosen.current = null; setValue(""); setError(""); onDone(url); };
  return <Dialog open={open} onOpenChange={(next) => { if (!next) close(); }}>
    <DialogContent className="max-w-md" onCloseAutoFocus={closed}>
      <DialogTitle>Embed a video or Gist</DialogTitle>
      <DialogDescription>Paste a YouTube video link or a GitHub Gist link. It goes on its own line and shows as a player or code in the published post.</DialogDescription>
      {/* The dialog renders in a portal, but React still bubbles its submit to the post's form. */}
      <form className="space-y-3" onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!blogEmbed(value)) { setError("That isn't a YouTube video or GitHub Gist link. Use an address like https://youtu.be/… or https://gist.github.com/user/…"); return; }
        chosen.current = value.trim();
        close();
      }}>
        <label htmlFor={`${id}-url`} className="block text-sm text-t2">Link</label>
        <input id={`${id}-url`} type="url" inputMode="url" className="field h-11 w-full" value={value} autoFocus aria-invalid={!!error || undefined} aria-describedby={error ? `${id}-error` : undefined} onChange={(event) => { setValue(event.target.value); setError(""); }} placeholder="https://youtu.be/…" />
        {error && <p id={`${id}-error`} role="alert" className="text-sm text-[hsl(var(--down))]">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <TextureButton type="button" variant="secondary" className="w-auto" onClick={close}>Cancel</TextureButton>
          <TextureButton type="submit" className="w-auto">Embed</TextureButton>
        </div>
      </form>
    </DialogContent>
  </Dialog>;
}
