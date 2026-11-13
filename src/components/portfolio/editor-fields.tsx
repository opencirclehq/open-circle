import { useId, useRef, useState, type ReactNode } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { AltArrowDownIcon, AltArrowUpIcon, CheckReadIcon, CodeSquareIcon, GalleryAddIcon, MagnifierIcon, TrashBinTrashIcon } from "@solar-icons/react/linear";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { TextureButton } from "@/components/ui/texture-button";
import { DisclosureSummary } from "@/components/ui/disclosure";
import { MetalButton } from "@/components/metal-button";
import { ContentSkeleton } from "@/components/site-skeleton";
import { portfolioApi } from "@/lib/portfolio-api";
import { MAX_IMAGE_BYTES, type PortfolioProject, type PortfolioRepository } from "@shared/portfolio";

export function EditorField({ label, hint, children, htmlFor }: { label: string; hint?: string; children: ReactNode; htmlFor: string }) {
  return <div className="studio-field"><label htmlFor={htmlFor}>{label}</label>{children}{hint && <p id={`${htmlFor}-hint`}>{hint}</p>}</div>;
}

export function ImageField({ label, value, onChange, upload, uploadsAvailable }: { label: string; value: string; onChange: (value: string) => void; upload: (file: File) => Promise<string>; uploadsAvailable: boolean }) {
  const id = useId();
  const file = useRef<HTMLInputElement>(null);
  return <div className="studio-image-field">
    <EditorField label={label} htmlFor={id} hint={uploadsAvailable ? "An HTTPS link, or upload a PNG, JPEG or WebP under 3 MB." : "An HTTPS image link. Uploads aren't connected yet."}><div className="flex items-center gap-2"><input id={id} type="url" className="field min-w-0 flex-1" value={value} onChange={(event) => onChange(event.target.value)} placeholder="https://…" maxLength={2048} /><MetalButton variant="icon" size="icon" className="size-11 shrink-0" innerClassName="p-0" type="button" aria-label="Upload image" title="Upload image" disabled={!uploadsAvailable} onClick={() => file.current?.click()}><GalleryAddIcon className="size-[18px]" aria-hidden /></MetalButton></div></EditorField>
    <input ref={file} type="file" className="sr-only" tabIndex={-1} aria-label={`Upload ${label.toLowerCase()}`} accept="image/png,image/jpeg,image/webp" disabled={!uploadsAvailable} onChange={async (event) => {
      const chosen = event.target.files?.[0];
      event.target.value = "";
      if (!chosen) return;
      if (chosen.size > MAX_IMAGE_BYTES || !["image/png", "image/jpeg", "image/webp"].includes(chosen.type)) { toast.error("Choose a PNG, JPEG or WebP smaller than 3 MB."); return; }
      try { onChange(await upload(chosen)); } catch { return; }
    }} />
  </div>;
}

export function RepositoryPicker({ ownerId, selected, onSelect }: { ownerId: number; selected: PortfolioProject[]; onSelect: (repository: PortfolioRepository) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const repositories = useInfiniteQuery({ queryKey: ["portfolio-repositories", ownerId], queryFn: ({ pageParam, signal }) => portfolioApi.repositories(pageParam, signal), initialPageParam: 1, getNextPageParam: (last) => last.nextPage ?? undefined, enabled: open, staleTime: 60_000, retry: false });
  const all = repositories.data?.pages.flatMap((page) => page.repositories) ?? [];
  const filtered = all.filter((repo) => `${repo.name} ${repo.description} ${repo.language}`.toLowerCase().includes(search.toLowerCase()));
  return <>
    <TextureButton variant="secondary" type="button" onClick={() => setOpen(true)}><CodeSquareIcon className="size-4" aria-hidden />Choose repositories<span className="ml-2 text-t3">{selected.length}/6</span></TextureButton>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="studio-repo-dialog max-w-xl"><DialogTitle>Your repositories</DialogTitle><DialogDescription>Choose up to six public repositories. Only the ones you select will appear on your portfolio.</DialogDescription>
      <div className="relative"><MagnifierIcon className="absolute left-4 top-3.5 size-4 text-t3" aria-hidden /><input className="field pl-11" aria-label="Search loaded repositories" placeholder="Search loaded repositories" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
      <div className="studio-repo-results" aria-busy={repositories.isFetching}>
        {repositories.isPending ? <ContentSkeleton label="Loading your repositories…" /> : repositories.isError ? <div className="py-6"><p role="alert" className="studio-help">{repositories.error.message}</p><TextureButton type="button" variant="secondary" className="mt-4 w-auto" onClick={() => void repositories.refetch()}>Try again</TextureButton></div> : filtered.length === 0 ? <p className="studio-help py-8 text-center">{search ? "No matching repositories on the loaded pages." : "You don't have any public repositories here yet."}</p> : filtered.map((repo) => {
          const added = selected.some((project) => project.repository.id === repo.id);
          return <button key={repo.id} type="button" className="studio-repo-option" onClick={() => onSelect(repo)} disabled={added || selected.length >= 6} aria-label={`${added ? "Selected" : "Add"} ${repo.name}`}>
            <span className="studio-repo-option-icon"><CodeSquareIcon className="size-5" aria-hidden /></span><span className="min-w-0 flex-1"><strong>{repo.name}</strong><span>{repo.description || repo.fullName}</span><small>{[repo.language, repo.stars > 0 ? `${repo.stars} stars` : ""].filter(Boolean).join(" · ")}</small></span><span className="studio-repo-add">{added ? <CheckReadIcon className="size-5" aria-hidden /> : "+"}</span>
          </button>;
        })}
      </div>
      {repositories.hasNextPage && <TextureButton type="button" variant="secondary" className="w-auto justify-self-center" onClick={() => void repositories.fetchNextPage()} loading={repositories.isFetchingNextPage}>{repositories.isFetchingNextPage ? "Loading…" : "Load more repositories"}</TextureButton>}
      <TextureButton type="button" onClick={() => setOpen(false)}>Done{selected.length > 0 ? ` · ${selected.length} selected` : ""}</TextureButton>
    </DialogContent></Dialog>
  </>;
}

export function ProjectEditor({ project, index, count, update, move, remove, upload, uploadsAvailable }: { project: PortfolioProject; index: number; count: number; update: (project: PortfolioProject) => void; move: (direction: -1 | 1) => void; remove: () => void; upload: (file: File) => Promise<string>; uploadsAvailable: boolean }) {
  const id = useId();
  return <details className="studio-project-editor" open={index === 0 ? true : undefined}>
    <DisclosureSummary><span className="studio-project-number">{String(index + 1).padStart(2, "0")}</span><span className="min-w-0 flex-1 truncate">{project.title || project.repository.name}</span></DisclosureSummary>
    <div className="studio-project-fields">
      <div className="flex flex-wrap items-center justify-between gap-2"><span className="max-w-full break-all text-xs text-t3">{project.repository.fullName}</span><div className="flex gap-1"><TextureButton type="button" variant="icon" size="icon" className="size-9" aria-label={`Move ${project.repository.name} up`} disabled={index === 0} onClick={() => move(-1)}><AltArrowUpIcon className="size-4" aria-hidden /></TextureButton><TextureButton type="button" variant="icon" size="icon" className="size-9" aria-label={`Move ${project.repository.name} down`} disabled={index === count - 1} onClick={() => move(1)}><AltArrowDownIcon className="size-4" aria-hidden /></TextureButton><TextureButton type="button" variant="icon" size="icon" className="size-9" aria-label={`Remove ${project.repository.name}`} onClick={remove}><TrashBinTrashIcon className="size-4" aria-hidden /></TextureButton></div></div>
      <EditorField label="Project title" htmlFor={`${id}-title`}><input id={`${id}-title`} className="field" value={project.title} placeholder={project.repository.name} onChange={(event) => update({ ...project, title: event.target.value })} maxLength={100} /></EditorField>
      <EditorField label="Project description" htmlFor={`${id}-summary`}><textarea id={`${id}-summary`} className="field studio-textarea" rows={3} value={project.summary} placeholder={project.repository.description || "What did you build?"} onChange={(event) => update({ ...project, summary: event.target.value })} maxLength={500} /></EditorField>
      <ImageField label="Project image" value={project.imageUrl} onChange={(imageUrl) => update({ ...project, imageUrl })} upload={upload} uploadsAvailable={uploadsAvailable} />
    </div>
  </details>;
}
