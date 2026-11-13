import { Link } from "react-router-dom";
import { CodeSquareIcon, SquareArrowRightUpIcon } from "@solar-icons/react/linear";
import { forumAuthorName } from "@shared/forum";
import { REPOSITORY_LABELS, type BlogArticle, type BlogPublicAuthor, type BlogRepository, type BlogSummary } from "@shared/blog";
import { GitHubIcon } from "@/components/brand-icons";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ShareButton } from "@/components/share-button";
import { TextureButton } from "@/components/ui/texture-button";
import { githubUrl } from "@/lib/format";
import { BlogBody } from "./blog-body";
import "./blog.css";

const longDate = new Intl.DateTimeFormat("en", { dateStyle: "medium" });

export function BlogDate({ at }: { at: number }) {
  return <time dateTime={new Date(at).toISOString()}>{longDate.format(at)}</time>;
}

/** The author's portfolio when they've published one, otherwise their GitHub profile. */
function profileLink(author: BlogPublicAuthor) {
  return author.portfolioUrl
    ? { href: author.portfolioUrl, label: `${forumAuthorName(author)}'s portfolio` }
    : { href: githubUrl(author.login), label: `${forumAuthorName(author)} on GitHub` };
}

function AuthorAvatar({ author, size }: { author: BlogPublicAuthor; size: string }) {
  return <Avatar className={size}><AvatarImage src={author.avatarUrl} alt="" loading="lazy" /><AvatarFallback className="text-xs font-medium text-t2" aria-hidden>{author.login.slice(0, 2).toUpperCase()}</AvatarFallback></Avatar>;
}

export function BlogByline({ author, publishedAt, editedAt, readingMinutes }: { author: BlogPublicAuthor; publishedAt: number; editedAt: number | null; readingMinutes: number }) {
  const profile = profileLink(author);
  return <div className="flex min-w-0 items-center gap-3">
    <a href={profile.href} className="blog-author-link" aria-label={profile.label} target={author.portfolioUrl ? undefined : "_blank"} rel={author.portfolioUrl ? undefined : "noopener noreferrer"}>
      <AuthorAvatar author={author} size="size-9" />
      <span className="blog-author-name break-words text-sm font-medium text-foreground [overflow-wrap:anywhere]">{forumAuthorName(author)}</span>
    </a>
    <p className="min-w-0 text-xs text-t3"><BlogDate at={publishedAt} /> · {readingMinutes} min read{editedAt && <> · Updated <BlogDate at={editedAt} /></>}</p>
  </div>;
}

export function BlogCard({ post }: { post: BlogSummary }) {
  return <li className="blog-card py-7"><article aria-labelledby={`blog-${post.slug}`} className="space-y-3">
    <div className="flex flex-wrap items-center gap-2"><span className="blog-topic">{post.topic}</span>{post.featured && <span className="blog-topic">Featured</span>}</div>
    <h2 id={`blog-${post.slug}`} className="break-words text-xl font-medium leading-snug tracking-[-0.02em] [overflow-wrap:anywhere]"><Link to={`/blog/${post.slug}`} className="blog-card-link hover:underline hover:underline-offset-4">{post.title}</Link></h2>
    <p className="max-w-prose break-words text-sm leading-relaxed text-t2 [overflow-wrap:anywhere]">{post.summary}</p>
    <BlogByline author={post.author} publishedAt={post.publishedAt} editedAt={null} readingMinutes={post.readingMinutes} />
  </article></li>;
}

export function RepositoryCard({ repository }: { repository: BlogRepository }) {
  return <a className="blog-repository" href={repository.url} target="_blank" rel="noopener noreferrer">
    {repository.provider === "github" ? <GitHubIcon className="size-5 shrink-0" /> : <CodeSquareIcon className="size-5 shrink-0" aria-hidden />}
    <span className="min-w-0 flex-1"><span className="block text-xs text-t3">Related repository on {REPOSITORY_LABELS[repository.provider]}</span><span className="block break-words text-sm font-medium text-foreground [overflow-wrap:anywhere]">{repository.fullName}</span></span>
    <SquareArrowRightUpIcon className="size-4 shrink-0 text-t3" aria-hidden /><span className="sr-only"> (opens in a new tab)</span>
  </a>;
}

function AboutAuthor({ author }: { author: BlogPublicAuthor }) {
  return <section aria-labelledby="blog-author-title" className="flex flex-col gap-4 rounded-[20px] bg-foreground/[0.045] p-5 sm:flex-row sm:items-center">
    <AuthorAvatar author={author} size="size-14" />
    <div className="min-w-0 flex-1 space-y-1">
      <p className="text-xs text-t3">Written by</p>
      <h2 id="blog-author-title" className="break-words text-lg font-medium [overflow-wrap:anywhere]">{forumAuthorName(author)}</h2>
      <p className="text-sm text-t3">@{author.login}</p>
    </div>
    <div className="flex flex-wrap gap-2">
      {author.portfolioUrl && <TextureButton asChild className="min-h-11 w-auto" innerClassName="px-4"><a href={author.portfolioUrl}>View portfolio</a></TextureButton>}
      <TextureButton asChild variant="secondary" className="min-h-11 w-auto" innerClassName="gap-2 px-4"><a href={githubUrl(author.login)} target="_blank" rel="noopener noreferrer"><GitHubIcon className="size-4" />GitHub<span className="sr-only"> (opens in a new tab)</span></a></TextureButton>
    </div>
  </section>;
}

export function BlogArticleView({ post }: { post: BlogArticle }) {
  const original = post.canonicalUrl ? new URL(post.canonicalUrl) : null;
  return <article aria-labelledby="blog-title" className="space-y-8">
    <header className="space-y-5">
      <span className="blog-topic">{post.topic}</span>
      <h1 id="blog-title" className="text-balance break-words text-[30px] font-medium leading-[1.12] tracking-[-0.035em] [overflow-wrap:anywhere] sm:text-[40px]">{post.title}</h1>
      <p className="max-w-prose break-words text-lg leading-relaxed text-t2">{post.summary}</p>
      <BlogByline author={post.author} publishedAt={post.publishedAt} editedAt={post.editedAt} readingMinutes={post.readingMinutes} />
      {original && <p className="text-sm text-t3">Originally published at <a href={original.href} target="_blank" rel="noopener noreferrer" className="text-t2 underline underline-offset-4">{original.hostname.replace(/^www\./, "")}<span className="sr-only"> (opens in a new tab)</span></a></p>}
    </header>
    <BlogBody>{post.body}</BlogBody>
    {post.repository && <RepositoryCard repository={post.repository} />}
    <footer className="space-y-6 border-t border-foreground/[0.08] pt-6">
      <ShareButton path={`/blog/${post.slug}`} title={post.title} kind="post" variant="filled" />
      <AboutAuthor author={post.author} />
    </footer>
  </article>;
}
