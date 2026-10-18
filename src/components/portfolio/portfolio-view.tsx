import type { CSSProperties } from "react";
import Markdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowRightUpIcon, CodeSquareIcon, MapPointIcon, SquareArrowRightUpIcon, StarIcon } from "@solar-icons/react/linear";
import { GitHubIcon } from "@/components/brand-icons";
import { TextureButton } from "@/components/ui/texture-button";
import { CONTACT_LABELS, PORTFOLIO_ACCENTS, contactHref, type PublicPortfolio } from "@shared/portfolio";
import type { MemberProgression } from "@shared/progression";
import { ProgressionPanel } from "@/components/board/progression-panel";
import "./portfolio.css";

function markdownUrl(url: string, key: string): string {
  const safe = defaultUrlTransform(url);
  if (key === "src") return safe.startsWith("https://") ? safe : "";
  return /^(https:\/\/|mailto:|#)/i.test(safe) ? safe : "";
}

export function PortfolioMarkdown({ children }: { children: string }) {
  return <div className="pf-markdown"><Markdown remarkPlugins={[remarkGfm]} skipHtml urlTransform={markdownUrl} components={{
    a: ({ children, href }) => <a href={href} target={href?.startsWith("https:") ? "_blank" : undefined} rel="noopener noreferrer">{children}</a>,
    img: ({ src, alt }) => src ? <img src={src} alt={alt ?? ""} loading="lazy" referrerPolicy="no-referrer" /> : null,
    h1: ({ children }) => <h3>{children}</h3>, h2: ({ children }) => <h3>{children}</h3>,
    table: ({ children }) => <div className="pf-table-scroll"><table>{children}</table></div>,
  }}>{children}</Markdown></div>;
}

export function PortfolioView({ portfolio, preview = false, progression }: { portfolio: PublicPortfolio; preview?: boolean; progression?: MemberProgression }) {
  const accent = PORTFOLIO_ACCENTS[portfolio.accent];
  const contacts = portfolio.contacts.filter((contact) => contact.visible && contact.value);
  const primary = contacts.find((contact) => contact.kind === portfolio.primaryContact);
  const available = portfolio.availability !== "unavailable";
  const style = { "--pf-accent": accent.color, "--pf-accent-ink": accent.ink } as CSSProperties;
  return (
    <article className={`pf pf-${portfolio.theme}${preview ? " pf-embedded" : ""}`} style={style} aria-label={`${portfolio.displayName}'s portfolio`}>
      <div className="pf-container">
        <nav className="pf-nav" aria-label="Portfolio">
          <a href="https://opencircle.cc" className="pf-brand"><img src="/favicon.svg" alt="" width={22} height={22} />OpenCircle</a>
          <a href={`https://github.com/${portfolio.githubLogin}`} className="pf-github" target="_blank" rel="noopener noreferrer"><GitHubIcon className="size-4" /><span>@{portfolio.githubLogin}</span><SquareArrowRightUpIcon className="size-3.5" aria-hidden /></a>
        </nav>
        <div className={`pf-cover pf-cover-${portfolio.coverStyle}`}>
          <div className="pf-cover-art" aria-hidden><span /><span /><span /></div>
          {portfolio.coverUrl && <img key={portfolio.coverUrl} src={portfolio.coverUrl} alt="Portfolio cover" className="pf-cover-image" style={{ objectPosition: `50% ${portfolio.coverPosition}%` }} referrerPolicy="no-referrer" fetchPriority={preview ? "auto" : "high"} onError={(event) => { event.currentTarget.style.visibility = "hidden"; }} />}
        </div>
        <header className="pf-intro">
          <div className="pf-identity-top">
            {portfolio.avatarUrl ? <img className="pf-avatar" src={portfolio.avatarUrl} alt={portfolio.displayName} width={104} height={104} /> : <span className="pf-avatar pf-avatar-placeholder"><GitHubIcon className="size-9" /></span>}
            {available && <span className="pf-availability"><span />{portfolio.availability === "available" ? "Available for work" : "Open to the right project"}</span>}
          </div>
          <div className="pf-identity-main">
            <div className="pf-name-block">
              <h1>{portfolio.displayName}</h1>
              {portfolio.headline && <p className="pf-headline">{portfolio.headline}</p>}
            </div>
            {primary && available && <TextureButton asChild className="pf-hire w-auto" innerClassName="px-6"><a href={contactHref(primary)} target={primary.kind === "email" ? undefined : "_blank"} rel="noopener noreferrer">Hire me<ArrowRightUpIcon className="size-4" aria-hidden /></a></TextureButton>}
          </div>
          {portfolio.bio && <p className="pf-bio">{portfolio.bio}</p>}
          {portfolio.location && <p className="pf-location"><MapPointIcon className="size-4" aria-hidden />{portfolio.location}</p>}
          {portfolio.skills.length > 0 && <ul className="pf-skills" aria-label="Skills">{portfolio.skills.map((skill) => <li key={skill}>{skill}</li>)}</ul>}
        </header>
        {portfolio.projects.length > 0 && <section className="pf-work" aria-labelledby="pf-work-title">
          <div className="pf-section-heading"><h2 id="pf-work-title">Selected work</h2><span>{portfolio.projects.length} {portfolio.projects.length === 1 ? "project" : "projects"}</span></div>
          <div className="pf-projects">
            {portfolio.projects.map((project, index) => <article className="pf-project" key={project.repository.id}>
              <a className={`pf-project-visual pf-project-visual-${index % 3}`} href={project.repository.homepage || project.repository.url || `https://github.com/${project.repository.fullName}`} target="_blank" rel="noopener noreferrer" tabIndex={-1} aria-hidden="true">
                {project.imageUrl ? <img key={project.imageUrl} src={project.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" onError={(event) => { event.currentTarget.style.visibility = "hidden"; }} /> : <div className="pf-project-art"><CodeSquareIcon className="pf-project-glyph" aria-hidden /><span>{project.title || project.repository.name}</span></div>}
                <span className="pf-project-open"><ArrowRightUpIcon className="size-5" /></span>
              </a>
              <div className="pf-project-info">
                <div className="pf-project-meta">{project.repository.language && <span>{project.repository.language}</span>}{project.repository.stars > 0 && <span><StarIcon className="size-3.5" aria-hidden />{project.repository.stars.toLocaleString("en-US")}</span>}</div>
                <h3><a href={project.repository.homepage || project.repository.url || `https://github.com/${project.repository.fullName}`} target="_blank" rel="noopener noreferrer">{project.title || project.repository.name}</a></h3>
                {(project.summary || project.repository.description) && <p>{project.summary || project.repository.description}</p>}
                <div className="pf-project-links"><a href={project.repository.url || `https://github.com/${project.repository.fullName}`} target="_blank" rel="noopener noreferrer"><GitHubIcon className="size-3.5" />Source<SquareArrowRightUpIcon className="size-3" aria-hidden /></a>{project.repository.homepage && <a href={project.repository.homepage} target="_blank" rel="noopener noreferrer">Visit project<SquareArrowRightUpIcon className="size-3.5" aria-hidden /></a>}</div>
              </div>
            </article>)}
          </div>
        </section>}
        {progression && <section className="pf-progress" aria-labelledby="pf-progress-title">
          <div className="pf-section-heading"><h2 id="pf-progress-title">Milestones</h2><span>{Object.keys(progression.achievements).length} earned</span></div>
          <ProgressionPanel progression={progression} />
        </section>}
        {portfolio.readme && <section className="pf-about" aria-label="About"><h2>More about me</h2><PortfolioMarkdown>{portfolio.readme}</PortfolioMarkdown></section>}
        {contacts.length > 0 && <section className="pf-contact" aria-labelledby="pf-contact-title"><div><h2 id="pf-contact-title">Get in touch</h2><p>{available ? "Let's talk about your next project." : "Find me online."}</p></div><div className="pf-contact-links">{contacts.map((contact) => <a key={contact.kind} href={contactHref(contact)} target={contact.kind === "email" ? undefined : "_blank"} rel="noopener noreferrer">{CONTACT_LABELS[contact.kind]}<ArrowRightUpIcon className="size-4" aria-hidden /></a>)}</div></section>}
        <footer className="pf-footer"><span>{portfolio.displayName}</span><a href="https://opencircle.cc/portfolio">Made with OpenCircle<ArrowRightUpIcon className="size-3" aria-hidden /></a></footer>
      </div>
    </article>
  );
}
