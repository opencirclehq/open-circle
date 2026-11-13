import { useId, useState } from "react";
import { GITHUB_REPOSITORY_URL } from "@shared/brand";
import { MetalButton } from "@/components/metal-button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

/** Builds the prefilled GitHub issue a submission becomes. No backend needed. */
export function submissionUrl({ name, link, description }: { name: string; link: string; description: string }) {
  const body = [`**Component:** ${name}`, `**Link:** ${link}`, "", description || "_No description._", "", "Submitted from the OpenCircle component library."].join("\n");
  const params = new URLSearchParams({ title: `Component: ${name}`, body, labels: "component" });
  return `${GITHUB_REPOSITORY_URL}/issues/new?${params}`;
}

export function SubmitDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const ids = { name: useId(), link: useId(), description: useId() };
  const [form, setForm] = useState({ name: "", link: "", description: "" });

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const name = form.name.trim();
    const link = form.link.trim();
    if (name.length < 2) { toast.error("Give the component a name."); return; }
    if (!/^https:\/\/\S+$/.test(link)) { toast.error("Add an https:// link to the code (GitHub, a gist or 21st.dev)."); return; }
    window.open(submissionUrl({ name, link, description: form.description.trim() }), "_blank", "noopener,noreferrer");
    toast.success("Opening GitHub to finish your submission.");
    setForm({ name: "", link: "", description: "" });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-md gap-0 rounded-[28px] border-0 p-6 shadow-none sm:rounded-[28px]">
        <DialogTitle className="text-base font-medium tracking-tight">Submit a component</DialogTitle>
        <DialogDescription className="mt-1 text-xs text-t3">It opens as a GitHub issue for review.</DialogDescription>
        <form onSubmit={submit} className="mt-5 space-y-3" noValidate>
          <label htmlFor={ids.name} className="sr-only">Component name</label>
          <input id={ids.name} className="field h-11 text-sm" placeholder="Component name" maxLength={60} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <label htmlFor={ids.link} className="sr-only">Link to the code</label>
          <input id={ids.link} className="field h-11 text-sm" type="url" inputMode="url" placeholder="https:// link to the code" value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })} />
          <label htmlFor={ids.description} className="sr-only">What it does</label>
          <textarea id={ids.description} className="field h-auto min-h-24 resize-none rounded-[20px] py-3 text-sm" placeholder="What it does (optional)" maxLength={500} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <MetalButton type="submit" wrapperClassName="w-full" className="h-11 w-full">Continue on GitHub</MetalButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}
