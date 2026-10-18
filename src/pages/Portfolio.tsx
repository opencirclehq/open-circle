import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MetalText } from "@/components/metal-text";
import { ArrowRightUpIcon, CheckReadIcon, CopyIcon, DisketteIcon, MonitorIcon, RefreshIcon, SmartphoneIcon } from "@solar-icons/react/linear";
import { toast } from "sonner";
import { GitHubIcon } from "@/components/brand-icons";
import { TextureButton } from "@/components/ui/texture-button";
import { MetalButton } from "@/components/metal-button";
import { AccountCorner } from "@/components/account-corner";
import { ContentSkeleton } from "@/components/site-skeleton";
import { Dock } from "@/components/dock";
import { guardedLeave, setLeaveGuard } from "@/lib/leave-guard";
import { SharedSelect } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { EditorField, ImageField, ProjectEditor, RepositoryPicker } from "@/components/portfolio/editor-fields";
import { PortfolioMarkdown, PortfolioView } from "@/components/portfolio/portfolio-view";
import { useCommunity } from "@/hooks/use-community";
import { useTheme } from "@/hooks/use-theme";
import { usePageMeta } from "@/hooks/use-page-meta";
import { ApiError } from "@/lib/api";
import { portfolioApi } from "@/lib/portfolio-api";
import { progressionApi } from "@/lib/progression-api";
import { CONTACT_KINDS, CONTACT_LABELS, PORTFOLIO_ACCENTS, defaultPortfolio, portfolioHostname, type ContactKind, type PortfolioContent, type PortfolioEditorState, type PublicPortfolio } from "@shared/portfolio";
import { parsePortfolio } from "@shared/portfolio-validation";
import { BRAND_NAME } from "@shared/brand";
import "@/components/portfolio/studio.css";

const EXAMPLE_PROFILE = { id: 0, login: "your-username", avatarUrl: "" };
const EXAMPLE: PublicPortfolio = {
  ...defaultPortfolio(EXAMPLE_PROFILE), displayName: "Your name", headline: "A developer with something to share.",
  bio: "Make space for your work, the ideas behind it, and the things you want to build next.", skills: ["Your skills", "Your interests", "Your approach"], availability: "available", githubLogin: "your-username", avatarUrl: "", publishedAt: 1,
  projects: [{ repository: { id: 1, name: "Your featured project", fullName: "your-username/your-project", description: "Tell the story behind something you've built. Add a cover, link to the code, and make it yours.", language: "Your stack", url: "https://github.com", homepage: "", stars: 0, forks: 0 }, title: "", summary: "", imageUrl: "" }],
};

/** Avatar top-right and the dock, on every portfolio state. */
function StudioChrome() {
  const navigate = useNavigate();
  const { resolvedTheme } = useTheme();
  return <>
    <AccountCorner leading={<button type="button" className="flex min-h-11 shrink-0 items-center rounded-full px-2" aria-label={`${BRAND_NAME} home`} onClick={() => guardedLeave(() => navigate("/"))}><MetalText font="650 15px/1 Aspekta, ui-sans-serif, system-ui, sans-serif" color={resolvedTheme === "dark" ? "#F4F7FB" : "#252E3D"} theme={resolvedTheme}>{BRAND_NAME}</MetalText></button>} />
    <Dock />
  </>;
}

function PortfolioIntro({ available }: { available: boolean }) {
  const [example, setExample] = useState(EXAMPLE);
  return <div className="studio"><StudioChrome /><main className="studio-intro">
    <div className="studio-intro-copy">
      <h1>Build a portfolio<br />from your GitHub.</h1>
      <MetalButton asChild className="h-11 w-auto" innerClassName="px-5"><a href={available ? "/api/auth-start?returnTo=/portfolio" : undefined} aria-disabled={!available} title={available ? undefined : "GitHub sign-in is being set up."}><GitHubIcon className="size-4" />Create with GitHub</a></MetalButton>
      <div className="studio-swatches" role="group" aria-label="Try an accent">{Object.entries(PORTFOLIO_ACCENTS).map(([key, accent]) => <button key={key} type="button" className="studio-swatch" aria-label={`${accent.label} preview accent`} aria-pressed={example.accent === key} onClick={() => setExample({ ...example, accent: key as PortfolioContent["accent"], coverStyle: "aurora" })}><span style={{ background: accent.color }} /></button>)}</div>
    </div>
    <div className="studio-intro-preview"><div className="studio-preview-toolbar"><span>Example</span><button type="button" className="text-xs text-t2" onClick={() => setExample({ ...example, theme: example.theme === "dark" ? "light" : "dark" })}>Try {example.theme === "dark" ? "light" : "dark"} theme</button></div><div className="studio-preview-frame"><PortfolioView portfolio={example} preview /></div></div>
  </main></div>;
}

export function PortfolioEditor({ initial }: { initial: PortfolioEditorState }) {
  const navigate = useNavigate();
  const client = useQueryClient();
  const [content, setContent] = useState(initial.draft);
  const [skillsText, setSkillsText] = useState(initial.draft.skills.join(", "));
  const [saved, setSaved] = useState(initial);
  const [savedContent, setSavedContent] = useState(JSON.stringify(initial.draft));
  const [tab, setTab] = useState("profile");
  const [device, setDevice] = useState("desktop");
  const [readmePreview, setReadmePreview] = useState(false);
  const [importRepo, setImportRepo] = useState("");
  const [dialog, setDialog] = useState<"publish" | "unpublish" | "leave" | "import" | null>(null);
  const [errorField, setErrorField] = useState<string | null>(null);
  const dirty = JSON.stringify(content) !== savedContent;
  const queryKey = ["portfolio-editor", initial.profile.id];
  const progression = useQuery({ queryKey: ["progression", initial.profile.login.toLowerCase()], queryFn: ({ signal }) => progressionApi.member(initial.profile.login, signal), enabled: initial.publishedAt != null, retry: false, staleTime: 60_000, refetchOnWindowFocus: false });
  const error = (failure: Error) => { setErrorField(failure instanceof ApiError ? failure.field ?? null : null); toast.error(failure.message, { id: "portfolio-error" }); };
  const save = useMutation({ mutationFn: (action: "save" | "publish" | "unpublish") => portfolioApi.save(action, content, saved.version), onSuccess: (next, action) => {
    setSaved(next);
    if (action !== "unpublish") { setContent(next.draft); setSkillsText(next.draft.skills.join(", ")); setSavedContent(JSON.stringify(next.draft)); }
    client.setQueryData(queryKey, next);
    setErrorField(null); setDialog(null);
    toast.success(action === "publish" ? "Your portfolio is published." : action === "unpublish" ? "Your portfolio is now private. Your saved draft is safe." : "Draft saved. Your published page stays as it was.");
  }, onError: error });
  const upload = useMutation({ mutationFn: portfolioApi.upload, onError: error });
  const sync = useMutation({ mutationFn: portfolioApi.profile, onSuccess: (details) => { setContent((current) => ({ ...current, ...details })); toast.success("Name, bio and location imported from GitHub."); }, onError: error });
  const readme = useMutation({ mutationFn: portfolioApi.readme, onSuccess: ({ readme: imported }) => { setContent((current) => ({ ...current, readme: imported })); setDialog(null); setReadmePreview(false); toast.success("README imported. You can edit it before publishing."); }, onError: error });
  const busy = save.isPending || upload.isPending || sync.isPending || readme.isPending;
  const change = <K extends keyof PortfolioContent>(key: K, value: PortfolioContent[K]) => { setContent((current) => ({ ...current, [key]: value })); if (errorField === key) setErrorField(null); };
  const uploadImage = async (file: File) => (await upload.mutateAsync(file)).url;
  const preview: PublicPortfolio = { ...content, githubLogin: initial.profile.login, avatarUrl: `https://avatars.githubusercontent.com/u/${initial.profile.id}?s=240`, publishedAt: saved.publishedAt ?? Date.now() };
  const publicUrl = saved.subdomainsAvailable ? `https://${portfolioHostname(saved.draft.slug)}` : `${window.location.origin}/p/${encodeURIComponent(saved.draft.slug)}`;
  const visibleContacts = content.contacts.filter((contact) => contact.visible && contact.value);
  const updateContact = (kind: ContactKind, value: string, visible?: boolean) => {
    const existing = content.contacts.find((contact) => contact.kind === kind);
    const next = { kind, value, visible: visible ?? existing?.visible ?? false };
    const contacts = [...content.contacts.filter((contact) => contact.kind !== kind), next];
    setContent((current) => ({ ...current, contacts, primaryContact: current.primaryContact === kind && (!next.visible || !next.value) ? "none" : current.primaryContact }));
  };
  const validate = () => {
    try { parsePortfolio(content, saved.version > 0 ? saved.draft.slug : undefined); setErrorField(null); return true; }
    catch (failure) {
      const field = (failure as { field?: string }).field ?? "";
      const section = ["slug", "name", "headline", "bio", "location", "skills"].includes(field) ? "profile" : ["email", "website", "whatsapp", "linkedin", "contacts", "primaryContact"].includes(field) ? "contact" : field.startsWith("project") || field === "projects" ? "projects" : field === "README" ? "readme" : "style";
      setTab(section); setErrorField(field); toast.error((failure as Error).message, { id: "portfolio-error" }); return false;
    }
  };
  useEffect(() => {
    if (initial.version <= saved.version || dirty || busy) return;
    setSaved(initial);
    setContent(initial.draft);
    setSkillsText(initial.draft.skills.join(", "));
    setSavedContent(JSON.stringify(initial.draft));
  }, [initial, saved.version, dirty, busy]);
  useEffect(() => {
    if (!dirty) return;
    const prevent = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [dirty]);
  const pendingLeave = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (!dirty) { setLeaveGuard(null); return; }
    setLeaveGuard((proceed) => { pendingLeave.current = proceed; setDialog("leave"); return true; });
    return () => setLeaveGuard(null);
  }, [dirty]);
  const previousTitle = useRef(document.title);
  useEffect(() => { document.title = "Your portfolio · OpenCircle"; const previous = previousTitle.current; return () => { document.title = previous; }; }, []);
  return <div className="studio"><form onSubmit={(event) => { event.preventDefault(); if (!busy && validate()) save.mutate("save"); }}>
    <StudioChrome />
    <main className="studio-body"><div className="studio-heading"><h1 className="sr-only">Your portfolio</h1><div className="studio-actions"><span className="studio-save-state hidden px-1 sm:flex" role="status">{busy ? "Saving…" : dirty ? "Unsaved" : saved.updatedAt ? <><CheckReadIcon className="size-3.5" />Saved</> : null}</span><MetalButton type="submit" variant="icon" size="icon" className="size-9" innerClassName="p-0" aria-label="Save draft" title="Save draft" loading={save.isPending && save.variables === "save"} disabled={busy || (!dirty && saved.version > 0)}><DisketteIcon className="size-4" aria-hidden /></MetalButton><MetalButton type="button" size="sm" className="h-9 w-auto" innerClassName="px-4" disabled={busy} loading={save.isPending && save.variables !== "save"} onClick={() => { if (validate()) setDialog("publish"); }}>{save.isPending ? "Saving…" : saved.publishedAt ? "Publish changes" : "Publish"}</MetalButton></div><div className="studio-domain"><span>{portfolioHostname(content.slug || initial.profile.login.toLowerCase())}</span>{saved.publishedAt && <><button type="button" aria-label="Copy portfolio link" onClick={() => { void navigator.clipboard.writeText(publicUrl).then(() => toast.success("Portfolio link copied.")).catch(() => toast.error("Couldn't copy. Open your page and copy its address.")); }}><CopyIcon className="size-3.5" aria-hidden /></button><a className="studio-back" href={publicUrl} target="_blank" rel="noopener noreferrer" aria-label="Open published portfolio"><ArrowRightUpIcon className="size-4" /></a></>}</div></div>
    <Tabs value={tab} onValueChange={setTab}><div className="studio-grid"><div className="studio-editor"><TabsList className="studio-tabs" aria-label="Portfolio sections">{[["profile", "Profile"], ["projects", "Projects"], ["readme", "README"], ["style", "Style"], ["contact", "Contact"]].map(([value, label]) => <TabsTrigger className="studio-tab" key={value} value={value}>{label}</TabsTrigger>)}</TabsList>
    <fieldset disabled={busy} className="min-w-0">
      <TabsContent value="profile" className="studio-section"><div className="studio-section-title"><div className="flex w-full items-center justify-between gap-3"><h2>Start with you</h2><MetalButton type="button" variant="icon" size="icon" className="size-9" innerClassName="p-0" aria-label="Import GitHub details" title="Import name, bio and location from GitHub" loading={sync.isPending} onClick={() => sync.mutate()}><RefreshIcon className="size-4" aria-hidden /></MetalButton></div><p>Your GitHub photo comes with you. Add the rest in your own words.</p></div>
        <EditorField label="Your address" htmlFor="portfolio-slug" hint={saved.version ? "This address is reserved for your account." : "Your address is reserved when you first save. Choose one you'll keep."}><div className="relative"><input id="portfolio-slug" className="field pr-32" value={content.slug} onChange={(event) => change("slug", event.target.value.toLowerCase())} disabled={saved.version > 0} maxLength={39} aria-invalid={errorField === "slug"} autoCapitalize="none" spellCheck={false} required /><span className="pointer-events-none absolute right-4 top-3.5 text-[11px] text-t3">.opencircle.cc</span></div></EditorField>
        <EditorField label="Name" htmlFor="portfolio-name"><input id="portfolio-name" className="field" value={content.displayName} onChange={(event) => change("displayName", event.target.value)} maxLength={80} aria-invalid={errorField === "name"} required autoComplete="name" /></EditorField>
        <EditorField label="Headline" htmlFor="portfolio-headline" hint="What you do, in a few words."><input id="portfolio-headline" className="field" value={content.headline} onChange={(event) => change("headline", event.target.value)} maxLength={120} placeholder="Frontend developer & open-source contributor" /></EditorField>
        <EditorField label="Bio" htmlFor="portfolio-bio" hint={`${content.bio.length}/500 characters`}><textarea id="portfolio-bio" rows={4} className="field studio-textarea" value={content.bio} onChange={(event) => change("bio", event.target.value)} maxLength={500} placeholder="A little about you and the work you care about." /></EditorField>
        <EditorField label="Location" htmlFor="portfolio-location"><input id="portfolio-location" className="field" value={content.location} onChange={(event) => change("location", event.target.value)} maxLength={80} placeholder="City, country or remote" autoComplete="address-level2" /></EditorField>
        <EditorField label="Skills" htmlFor="portfolio-skills" hint="Separate skills with commas. Up to 12, with 32 characters each."><input id="portfolio-skills" className="field" value={skillsText} maxLength={430} onBlur={() => setSkillsText(content.skills.join(", "))} onChange={(event) => { setSkillsText(event.target.value); const parts = event.target.value.split(",").map((skill) => skill.trim()).filter(Boolean); change("skills", parts); }} placeholder="TypeScript, React, Product design" /></EditorField>
      </TabsContent>
      <TabsContent value="projects" className="studio-section"><div className="studio-section-title"><h2>The work you're proud of</h2><p>Pick up to six repositories. Move your favorite to the top, and give each project its own story.</p></div><RepositoryPicker ownerId={initial.profile.id} selected={content.projects} onSelect={(repository) => { if (content.projects.length < 6 && !content.projects.some((project) => project.repository.id === repository.id)) change("projects", [...content.projects, { repository, title: "", summary: "", imageUrl: "" }]); }} />
        {content.projects.length === 0 && <div className="rounded-2xl bg-foreground/[.025] px-6 py-9 text-center"><p className="text-sm text-t2">Your projects belong here.</p><p className="studio-help mt-2">Start with one repository. You can add more later.</p></div>}
        {content.projects.map((project, index) => <ProjectEditor key={project.repository.id} project={project} index={index} count={content.projects.length} update={(next) => change("projects", content.projects.map((current, at) => at === index ? next : current))} remove={() => change("projects", content.projects.filter((_, at) => at !== index))} move={(direction) => { const projects = [...content.projects]; [projects[index], projects[index + direction]] = [projects[index + direction], projects[index]]; change("projects", projects); }} upload={uploadImage} uploadsAvailable={saved.uploadsAvailable} />)}
      </TabsContent>
      <TabsContent value="readme" className="studio-section"><div className="studio-section-title"><h2>A little more about you</h2><p>Write in Markdown. Share your approach, experience, or what you're learning.</p></div><div className="flex items-center justify-between gap-3"><label className="text-xs text-t2" htmlFor="portfolio-readme">Your README</label><button type="button" className="text-xs text-t3" onClick={() => setReadmePreview(!readmePreview)}>{readmePreview ? "Keep writing" : "Preview Markdown"}</button></div>
        {readmePreview ? <div className="studio-readme-preview">{content.readme ? <PortfolioMarkdown>{content.readme}</PortfolioMarkdown> : <p className="studio-help">Your writing will appear here.</p>}</div> : <textarea id="portfolio-readme" className="field studio-textarea studio-readme" rows={16} value={content.readme} onChange={(event) => change("readme", event.target.value)} maxLength={20_000} placeholder={"## Hi, I'm…\n\nHere's a little about what I build and why.\n\n- What I'm working on\n- What I'd love to work on next"} />}
        <p className="studio-help">{content.readme.length.toLocaleString("en-US")}/20,000 characters. Links, images, lists, tables and code blocks are supported.</p>
        {content.projects.length > 0 && <><EditorField label="Or import a project README" htmlFor="portfolio-readme-repo"><SharedSelect id="portfolio-readme-repo" value={importRepo} onValueChange={setImportRepo} options={content.projects.map((project) => ({ value: String(project.repository.id), label: project.repository.name }))} placeholder="Choose a selected repository" /></EditorField><TextureButton type="button" variant="secondary" className="w-auto self-start" disabled={!importRepo} onClick={() => { if (content.readme.trim()) setDialog("import"); else readme.mutate(Number(importRepo)); }}>Import README</TextureButton></>}
      </TabsContent>
      <TabsContent value="style" className="studio-section"><div className="studio-section-title"><h2>Set the tone</h2><p>Choose a theme, accent and cover.</p></div><div className="studio-field"><label>Page theme</label><div className="studio-theme-options" role="group" aria-label="Page theme">{["dark", "light"].map((theme) => <button className="studio-theme-option" data-theme={theme} type="button" key={theme} aria-pressed={content.theme === theme} onClick={() => change("theme", theme as PortfolioContent["theme"])}><span className="studio-theme-sample" aria-hidden><i /><i /></span>{theme === "dark" ? "Midnight" : "Daylight"}</button>)}</div></div>
        <div className="studio-field"><label>Accent color · {PORTFOLIO_ACCENTS[content.accent].label}</label><div className="studio-swatches" role="group" aria-label="Accent color">{Object.entries(PORTFOLIO_ACCENTS).map(([key, accent]) => <button key={key} type="button" className="studio-swatch" aria-label={accent.label} aria-pressed={content.accent === key} onClick={() => change("accent", key as PortfolioContent["accent"])}><span style={{ background: accent.color }} /></button>)}</div></div>
        <div className="studio-field"><label>Built-in cover</label><div className="studio-style-options" role="group" aria-label="Built-in cover">{[["studio", "Studio"], ["aurora", "Aurora"], ["contour", "Contour"]].map(([value, label]) => <button key={value} type="button" className="studio-cover-option" aria-pressed={!content.coverUrl && content.coverStyle === value} onClick={() => setContent((current) => ({ ...current, coverStyle: value as PortfolioContent["coverStyle"], coverUrl: "" }))}><span className={`pf-cover pf-cover-${value}`} style={{ "--pf-accent": PORTFOLIO_ACCENTS[content.accent].color } as CSSProperties}><span className="pf-cover-art" aria-hidden><span /><span /><span /></span></span>{label}</button>)}</div></div>
        <ImageField label="Cover image" value={content.coverUrl} onChange={(value) => change("coverUrl", value)} upload={uploadImage} uploadsAvailable={saved.uploadsAvailable} />
        {content.coverUrl && <EditorField label="Cover position" htmlFor="portfolio-cover-position" hint="Move the focus up or down to frame your image."><input id="portfolio-cover-position" type="range" min={0} max={100} value={content.coverPosition} onChange={(event) => change("coverPosition", Number(event.target.value))} className="w-full accent-foreground" /></EditorField>}
      </TabsContent>
      <TabsContent value="contact" className="studio-section"><div className="studio-section-title"><h2>Let the right people reach you</h2><p>Your group WhatsApp number stays private. Only details you add here and switch on will be public.</p></div>
        <EditorField label="Availability" htmlFor="portfolio-availability"><SharedSelect id="portfolio-availability" value={content.availability} onValueChange={(value) => change("availability", value as PortfolioContent["availability"])} options={[{ value: "available", label: "Available for work" }, { value: "selective", label: "Open to the right project" }, { value: "unavailable", label: "Not looking right now" }]} /></EditorField>
        {CONTACT_KINDS.map((kind) => { const contact = content.contacts.find((entry) => entry.kind === kind); return <div key={kind} className="studio-contact-setting"><div className="studio-contact-label"><label htmlFor={`portfolio-contact-${kind}`}>{CONTACT_LABELS[kind]}</label><span className="studio-contact-visibility"><label htmlFor={`portfolio-visible-${kind}`}>Public</label><Switch id={`portfolio-visible-${kind}`} checked={contact?.visible ?? false} onCheckedChange={(checked) => updateContact(kind, contact?.value ?? "", checked)} aria-label={`Show ${CONTACT_LABELS[kind]} publicly`} /></span></div><input id={`portfolio-contact-${kind}`} className="field" type={kind === "email" ? "email" : kind === "whatsapp" ? "tel" : "url"} autoComplete="off" value={contact?.value ?? ""} maxLength={kind === "email" ? 254 : 2048} aria-invalid={errorField === kind} onChange={(event) => updateContact(kind, event.target.value)} placeholder={kind === "email" ? "you@example.com" : kind === "whatsapp" ? "+234…" : kind === "linkedin" ? "https://linkedin.com/in/…" : "https://…"} />{kind === "whatsapp" && contact?.visible && <p className="studio-help">Visitors will be able to see this number and open a WhatsApp chat with you.</p>}</div>; })}
        <EditorField label="Hire me button" htmlFor="portfolio-hire" hint="The button appears when you're open to work and a public contact is selected."><SharedSelect id="portfolio-hire" value={content.primaryContact} onValueChange={(value) => change("primaryContact", value as PortfolioContent["primaryContact"])} options={[{ value: "none", label: "Hide the button" }, ...visibleContacts.map((contact) => ({ value: contact.kind, label: `Contact me by ${CONTACT_LABELS[contact.kind]}` }))]} /></EditorField>
      </TabsContent>
    </fieldset>
    {saved.publishedAt && <div className="studio-editor-footer"><span>Published</span><button type="button" disabled={busy} onClick={() => setDialog("unpublish")}>Unpublish</button></div>}
    </div><aside className="studio-preview" aria-label="Live portfolio preview"><div className="studio-preview-toolbar"><span>Preview</span><div className="studio-preview-switch" role="group" aria-label="Preview size"><button type="button" aria-label="Desktop preview" aria-pressed={device === "desktop"} onClick={() => setDevice("desktop")}><MonitorIcon className="size-4" aria-hidden /></button><button type="button" aria-label="Mobile preview" aria-pressed={device === "mobile"} onClick={() => setDevice("mobile")}><SmartphoneIcon className="size-4" aria-hidden /></button></div></div><div className="studio-preview-frame" data-device={device}><PortfolioView portfolio={preview} preview progression={progression.data} /></div></aside></div></Tabs>
    </main></form>
    <Dialog open={dialog !== null} onOpenChange={(open) => { if (!open && !busy) setDialog(null); }}><DialogContent className="studio-repo-dialog max-w-md"><DialogTitle>{dialog === "publish" ? saved.publishedAt ? "Publish your changes?" : "Ready to share your work?" : dialog === "unpublish" ? "Take your portfolio offline?" : dialog === "import" ? "Replace your README?" : "Leave your unsaved changes?"}</DialogTitle><DialogDescription>{dialog === "publish" ? "Your profile, selected work and public contacts will be visible to anyone with your link." : dialog === "unpublish" ? "Visitors won't be able to see your page. Your saved draft and address stay yours." : dialog === "import" ? "The imported README will replace what you've written here. You can edit it before saving." : "The changes you've made since your last save will be lost."}</DialogDescription>
      {dialog === "publish" && <div className="space-y-3 rounded-2xl bg-foreground/[.04] p-4"><p className="break-all text-sm">{portfolioHostname(content.slug)}</p><p className="text-xs text-t3">{content.projects.length} selected {content.projects.length === 1 ? "repository" : "repositories"}</p><p className="text-xs text-t3">Public contacts: {visibleContacts.length ? visibleContacts.map((contact) => CONTACT_LABELS[contact.kind]).join(", ") : "none"}</p>{!saved.subdomainsAvailable && <p className="text-xs leading-relaxed text-t3">Your page will have a shareable link. Your subdomain will become available when domain setup is complete.</p>}</div>}
      <div className="mt-2 flex flex-wrap justify-end gap-2"><TextureButton type="button" variant="secondary" className="w-auto" disabled={busy} onClick={() => setDialog(null)}>Keep editing</TextureButton><TextureButton type="button" className="w-auto" loading={busy} onClick={() => { if (dialog === "publish") save.mutate("publish"); else if (dialog === "unpublish") save.mutate("unpublish"); else if (dialog === "import") readme.mutate(Number(importRepo)); else { setDialog(null); const proceed = pendingLeave.current; pendingLeave.current = null; if (proceed) { setLeaveGuard(null); proceed(); } else navigate("/"); } }}>{busy ? "Working…" : dialog === "publish" ? "Publish portfolio" : dialog === "unpublish" ? "Unpublish" : dialog === "import" ? "Replace README" : "Leave page"}</TextureButton></div>
    </DialogContent></Dialog>
  </div>;
}

export default function Portfolio() {
  usePageMeta();
  const community = useCommunity();
  const profile = community.data?.profile;
  const state = useQuery({ queryKey: ["portfolio-editor", profile?.id], queryFn: ({ signal }) => portfolioApi.editor(signal), enabled: !!profile, retry: false, staleTime: 0, gcTime: 0, refetchOnWindowFocus: false, refetchOnReconnect: false });
  if (community.isPending || (profile && state.isPending)) return <div className="studio"><StudioChrome /><main className="studio-body"><ContentSkeleton label="Loading your portfolio…" detail /></main></div>;
  if (community.isError || (profile && state.isError)) return <div className="studio"><StudioChrome /><main className="studio-error-panel"><h1>Couldn't open your portfolio</h1><p>{state.error?.message ?? community.error?.message}</p><TextureButton type="button" className="mt-6 w-auto" onClick={() => { void community.refetch(); void state.refetch(); }}>Try again</TextureButton></main></div>;
  if (!profile) return <PortfolioIntro available={community.data?.signInAvailable ?? false} />;
  return state.data ? <PortfolioEditor key={profile.id} initial={state.data} /> : null;
}
