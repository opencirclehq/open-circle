import type { CoordinationAdminState } from "@shared/coordination";
import { Chip } from "@/components/panel";
import { BotButton, BotConfirm, BotItem, BotLink, type BotActions } from "./bot-controls";
import { BotQueue } from "./bot-queue";

const statuses = [{ value: "pending", label: "Awaiting review" }, { value: "all", label: "All submissions" }, { value: "approved", label: "Approved" }, { value: "rejected", label: "Returned" }, { value: "closed", label: "Closed" }];
const date = (at: number) => new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(at);

export function BotRepositories({ data, actions }: { data: CoordinationAdminState; actions: BotActions }) {
  if (!data.community) return <p className="py-5 text-sm text-t3">Repository management is unavailable on this version of the bot. Update the bot, then refresh this section.</p>;
  const repos = [...data.community.repositories].sort((a, b) => Number(b.status === "pending") - Number(a.status === "pending") || b.createdAt - a.createdAt);
  return <BotQueue title="Repositories" items={repos} searchText={(repo) => `${repo.fullName} ${repo.owner} ${repo.summary} ${repo.skills.join(" ")}`} empty="No repository submissions yet." busy={actions.busy} filters={statuses} initialFilter="pending" matches={(repo, filter) => filter === "all" || repo.status === filter}>
    {(repo) => <BotItem key={repo.id} title={<span className="flex flex-wrap items-center gap-3"><BotLink href={repo.url}>{repo.fullName}</BotLink><Chip tone={repo.status === "pending" ? "warn" : repo.status === "approved" ? "ok" : "muted"}>{repo.status === "pending" ? "Awaiting review" : repo.status === "rejected" ? "Returned" : repo.status}</Chip></span>} detail={`Submitted by ${repo.owner} · ${date(repo.createdAt)}\n${repo.summary}`}>
      <dl className="grid gap-3 text-sm sm:grid-cols-2"><div><dt className="text-xs text-t3">Help wanted</dt><dd className="mt-1 whitespace-pre-line break-words">{repo.helpWanted}</dd></div><div><dt className="text-xs text-t3">Licence & maintainer</dt><dd className="mt-1">{repo.license}{repo.fork ? " · Fork" : ""} · {repo.tagOwner ? "Tagging allowed" : "No maintainer tag"}</dd>{repo.skills.length > 0 && <dd className="mt-1 break-words text-t3">{repo.skills.join(", ")}</dd>}</div></dl>
      {repo.issues.length > 0 && <div className="space-y-1"><p className="text-xs text-t3">Starter issues</p>{repo.issues.map((url) => <div key={url}><BotLink href={url} /></div>)}</div>}
      {repo.reason && <p className="whitespace-pre-line break-words text-sm text-t2">Review note: {repo.reason}</p>}
      {repo.status === "approved" && <p className="text-xs text-t3">{repo.announcedAt ? `Announced ${date(repo.announcedAt)}` : "Queued for announcement"} · {repo.needsHelp ? "Looking for contributors" : "Help paused"}{repo.followedUpAt ? " · Follow-up shared" : ""} · Pin: {repo.pinStatus}</p>}
      {repo.status === "pending" && <div className="flex flex-wrap gap-2"><BotConfirm label="Approve repository" title={`Approve ${repo.fullName}?`} description="Approval makes this submission visible to members and queues its announcement when repository announcements are enabled." license input={() => ({ action: "repository-review", id: repo.id, approve: true, licenseConfirmed: true })} actions={actions} /><BotConfirm label="Return submission" title={`Return ${repo.fullName}`} description="Tell the member what needs to change before this repository can be approved." reason input={(text) => ({ action: "repository-review", id: repo.id, approve: false, text })} actions={actions} /></div>}
    </BotItem>}
  </BotQueue>;
}

export function BotProjects({ data, actions }: { data: CoordinationAdminState; actions: BotActions }) {
  return <BotQueue title="Projects" items={[...data.projects].sort((a, b) => b.createdAt - a.createdAt)} searchText={(project) => `${project.title} ${project.owner} ${project.url}`} empty="No project submissions yet." busy={actions.busy} filters={statuses.filter((entry) => entry.value !== "rejected")} initialFilter="pending" matches={(project, filter) => filter === "all" || project.status === filter}>
    {(project) => <BotItem key={project.id} title={`${project.title} · ${project.owner}`} detail={`${project.status} · ${date(project.createdAt)} · ${project.reviews} reviews${project.feedbackWanted ? `\n${project.feedbackWanted}` : ""}`}><BotLink href={project.url} />{project.skills?.length ? <p className="text-xs text-t3">{project.skills.join(", ")}</p> : null}{project.status === "pending" && <div className="flex flex-wrap gap-2"><BotButton input={{ action: "project", id: project.id, approve: true }} actions={actions}>Approve project</BotButton><BotButton input={{ action: "project", id: project.id, approve: false }} actions={actions}>Reject project</BotButton></div>}</BotItem>}
  </BotQueue>;
}

export function BotFeedback({ data, actions }: { data: CoordinationAdminState; actions: BotActions }) {
  const entries = [...data.contributions].sort((a, b) => Number(b.status === "pending") - Number(a.status === "pending") || b.createdAt - a.createdAt);
  return <BotQueue title="Feedback" items={entries} searchText={(entry) => `${entry.by} ${entry.for} ${entry.text}`} empty="No feedback has been submitted yet." busy={actions.busy} filters={statuses.filter((entry) => entry.value !== "closed")} initialFilter="pending" matches={(entry, filter) => filter === "all" || entry.status === filter}>
    {(entry) => { const target = data.projects.find((project) => project.id === entry.targetId) ?? data.community?.repositories.find((repo) => repo.id === entry.targetId); const question = data.help.find((help) => help.id === entry.targetId); return <BotItem key={entry.id} title={`${entry.by} helped ${entry.for}`} detail={`${entry.kind === "review" ? "Project review" : "Answer"} · ${entry.status} · ${date(entry.createdAt)}\n${entry.text}`}>
      {target && <BotLink href={target.url}>{"title" in target ? target.title : target.fullName}</BotLink>}{question && <p className="text-sm text-t3">Question: {question.question}</p>}
      <div className="flex flex-wrap gap-2">{entry.status === "pending" ? <><BotButton input={{ action: "contribution", id: entry.id, approve: true }} actions={actions}>Confirm useful</BotButton><BotButton input={{ action: "contribution", id: entry.id, approve: false }} actions={actions}>Needs more detail</BotButton></> : entry.status === "approved" ? <BotConfirm label="Revoke confirmation" title="Revoke this confirmation?" description={`This removes the confirmed help credit for ${entry.by}. Explain why it should be revoked.`} reason input={(text) => ({ action: "revoke-contribution", id: entry.id, text })} actions={actions} /> : null}</div>
    </BotItem>; }}
  </BotQueue>;
}
