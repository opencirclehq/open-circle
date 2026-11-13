import type { ParticipationAction, RepositorySubmission } from "@shared/coordination";
import { MetalButton } from "@/components/metal-button";
import { PaginatedList } from "@/components/pagination";
import { Panel, PanelHeader } from "@/components/panel";
import { DisclosureSummary } from "@/components/ui/disclosure";

export function RepositorySubmissions({ repositories, login, busy, submit, contribute }: { repositories: RepositorySubmission[]; login: string; busy: boolean; submit: (input: ParticipationAction) => Promise<boolean>; contribute: (repo: RepositorySubmission) => void }) {
  return <section id="repositories" className="scroll-mt-24">
    <Panel header={<PanelHeader title="Open-source repos" />}>
      {repositories.length ? <PaginatedList items={repositories} label="Open-source submissions" resetKey={login} disabled={busy}>{(repo) => {
        const mine = repo.owner.toLowerCase() === login.toLowerCase();
        return <li key={repo.id} className="space-y-3 border-b border-foreground/[0.06] py-5 last:border-0">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <a href={repo.url} target="_blank" rel="noopener noreferrer" className="min-w-0 break-all text-sm font-medium underline underline-offset-4">{repo.fullName}</a>
            <span className="text-xs text-t3">{repo.status === "pending" ? "Awaiting admin review" : repo.status === "approved" ? repo.announcedAt ? "Announced" : "Queued for announcement" : repo.status === "rejected" ? "Changes needed" : "Closed"}</span>
          </div>
          <p className="break-words text-sm text-t2">{repo.summary}</p>
          <p className="break-words text-sm text-t2">Help wanted: {repo.helpWanted}</p>
          <p className="break-words text-xs text-t3">Shared by {repo.owner} · {repo.license}{repo.fork ? " · Fork" : ""}{repo.skills.length > 0 ? ` · ${repo.skills.join(", ")}` : ""}</p>
          {repo.issues.length > 0 && <ul className="space-y-2 text-sm">{repo.issues.map((issue) => <li key={issue}><a href={issue} target="_blank" rel="noopener noreferrer" className="break-all text-t2 underline underline-offset-4">Starter issue #{issue.split("/").at(-1)}</a></li>)}</ul>}
          {repo.reason && <p className="break-words text-sm text-t2">Admin feedback: {repo.reason}</p>}
          {repo.status === "approved" && <p className="text-xs text-t3">{repo.needsHelp ? "Looking for contributors" : "Help requests paused"}{repo.followedUpAt ? " · Follow-up shared" : ""}</p>}
          {!mine && repo.status === "approved" && repo.needsHelp && <MetalButton variant="secondary" size="sm" className="w-auto" disabled={busy} onClick={() => contribute(repo)}>Record your help</MetalButton>}
          {mine && ["pending", "approved"].includes(repo.status) && <div className="flex flex-wrap gap-2">
            <MetalButton variant="minimal" size="sm" disabled={busy} onClick={() => submit({ action: "repository-progress", id: repo.id, needsHelp: !repo.needsHelp })}>{repo.needsHelp ? "Pause help requests" : "Still need help"}</MetalButton>
            <MetalButton variant="minimal" size="sm" disabled={busy} onClick={() => submit({ action: "close", id: repo.id })}>Close submission</MetalButton>
          </div>}
        </li>;
      }}</PaginatedList> : <p className="py-5 text-sm text-t3">Submit a public repo for the group to contribute to. An admin reviews it before it is announced.</p>}
      <details className="border-t border-foreground/[0.06] py-4">
        <DisclosureSummary className="text-sm font-medium">Submit an open-source repo</DisclosureSummary>
        <form className="space-y-4 pt-5" onSubmit={async (event) => {
          event.preventDefault();
          if (busy) return;
          const form = event.currentTarget;
          const values = new FormData(form);
          const saved = await submit({ action: "repository", url: String(values.get("url")), summary: String(values.get("summary")), helpWanted: String(values.get("helpWanted")), issues: String(values.get("issues") ?? "").split(/\s+/).filter(Boolean), skills: String(values.get("skills") ?? "").split(",").map((skill) => skill.trim()).filter(Boolean), permission: values.get("permission") === "on", tagOwner: values.get("tagOwner") === "on" });
          if (saved) form.reset();
        }}>
          <fieldset disabled={busy} className="space-y-4">
            <label className="block space-y-1.5 text-sm"><span>GitHub repository link</span><input name="url" type="url" className="field placeholder:text-t3 h-11 text-sm" required maxLength={300} placeholder="https://github.com/owner/repo" /></label>
            <label className="block space-y-1.5 text-sm"><span>What does it do?</span><textarea name="summary" className="field placeholder:text-t3 min-h-24 resize-none rounded-[20px] py-3 text-sm" required minLength={15} maxLength={300} rows={3} placeholder="e.g. A tool for finding beginner-friendly GitHub issues" /></label>
            <label className="block space-y-1.5 text-sm"><span>What help do you need?</span><textarea name="helpWanted" className="field placeholder:text-t3 min-h-24 resize-none rounded-[20px] py-3 text-sm" required minLength={10} maxLength={300} rows={3} placeholder="e.g. Help with tests, documentation and mobile layouts" /></label>
            <label className="block space-y-1.5 text-sm"><span>Starter issue links, one per line (optional)</span><textarea name="issues" className="field placeholder:text-t3 min-h-24 resize-none rounded-[20px] py-3 text-sm" maxLength={1000} rows={3} placeholder={"https://github.com/owner/repo/issues/1\nhttps://github.com/owner/repo/issues/2"} /><span className="block text-xs text-t3">Up to three open issues from this repo.</span></label>
            <label className="block space-y-1.5 text-sm"><span>Skills needed, separated by commas (optional)</span><input name="skills" className="field placeholder:text-t3 h-11 text-sm" maxLength={240} placeholder="react, documentation" /></label>
            <p className="text-xs leading-relaxed text-t3">The repo must be public, active and have a recognised open-source licence. Approved submissions enter the daily queue, with one follow-up after 48 hours if help is still needed.</p>
            <label className="flex items-start gap-3 text-sm text-t2"><input name="permission" type="checkbox" required className="mt-1 size-4 shrink-0 accent-foreground" />I maintain this repo or have permission to submit it.</label>
            <label className="flex items-start gap-3 text-sm text-t2"><input name="tagOwner" type="checkbox" className="mt-1 size-4 shrink-0 accent-foreground" />The bot may tag me when sharing my repo in our group.</label>
            <MetalButton type="submit" loading={busy} disabled={busy} className="min-h-11" innerClassName="px-5">Submit repo for approval</MetalButton>
          </fieldset>
        </form>
      </details>
    </Panel>
  </section>;
}
