import { HELPER_POLICY } from "@shared/coordination";
import { STAR_HELP_POINTS } from "@shared/star-help";
import type { Weights } from "@shared/types";
import { COMMUNITY_ACTIVITY_POLICY } from "@shared/community-activity";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

export function HowItWorks({
  open,
  onOpenChange,
  helpersDelayed = false,
  communityDelayed = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  weights?: Weights;
  helpersDelayed?: boolean;
  communityDelayed?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-sm gap-0 overflow-y-auto rounded-[28px] border-0 bg-popover p-6 shadow-none sm:rounded-[28px]">
        <DialogTitle className="pr-8 text-base font-medium tracking-tight">How ranking works</DialogTitle>
        <DialogDescription className="mt-1 text-sm text-t3">Earn points by helping and taking part.</DialogDescription>

        <dl className="mt-5 space-y-3 text-sm">
          <div className="flex items-baseline justify-between gap-4"><dt className="text-t2">Confirmed useful help</dt><dd className="whitespace-nowrap font-medium tabular">{HELPER_POLICY.contributionPoints} pts</dd></div>
          <div className="flex items-baseline justify-between gap-4"><dt className="text-t2">Each different member helped</dt><dd className="whitespace-nowrap font-medium tabular">+{HELPER_POLICY.peerPoints} pts</dd></div>
          <div className="flex items-baseline justify-between gap-4"><dt className="text-t2">Star another member's repo</dt><dd className="whitespace-nowrap font-medium tabular">{STAR_HELP_POINTS} pts</dd></div>
          <div className="flex items-baseline justify-between gap-4"><dt className="text-t2">Published discussion or question</dt><dd className="whitespace-nowrap font-medium tabular">{COMMUNITY_ACTIVITY_POLICY.post.points} pts</dd></div>
          <div className="flex items-baseline justify-between gap-4"><dt className="text-t2">Comment or reply</dt><dd className="whitespace-nowrap font-medium tabular">{COMMUNITY_ACTIVITY_POLICY.comment.points} pts</dd></div>
          <div className="flex items-baseline justify-between gap-4"><dt className="text-t2">Like or poll vote</dt><dd className="whitespace-nowrap font-medium tabular">{COMMUNITY_ACTIVITY_POLICY.like.points} pt</dd></div>
        </dl>
        <p className="mt-5 text-sm leading-relaxed text-t3">Your confirmed help doesn't expire. Choose All time, 7 days or 30 days to change the period shown.</p>
        <p className="mt-3 text-sm leading-relaxed text-t3">The member or an admin must confirm your help. We count up to {HELPER_POLICY.dailyLimit} helps a day and {HELPER_POLICY.perPeerLimit} per person in {HELPER_POLICY.perPeerWindowDays} days. Copied feedback and helping yourself don't count.</p>
        <p className="mt-3 text-sm leading-relaxed text-t3">Stars count once per member, here or on GitHub, on public, original repos. Removing your last qualifying star removes that credit.</p>
        <p className="mt-3 text-sm leading-relaxed text-t3">GitHub stats and community upvotes add up to {HELPER_POLICY.reputationCap} extra points in every view.</p>
        <p className="mt-3 text-sm leading-relaxed text-t3">Each UTC day: up to {COMMUNITY_ACTIVITY_POLICY.post.dailyLimit} posts, {COMMUNITY_ACTIVITY_POLICY.comment.dailyLimit} comments, {COMMUNITY_ACTIVITY_POLICY.like.dailyLimit} likes and {COMMUNITY_ACTIVITY_POLICY.vote.dailyLimit} poll votes. Comments need {COMMUNITY_ACTIVITY_POLICY.minimumCommentLength} characters; only {COMMUNITY_ACTIVITY_POLICY.commentsPerThread} per thread earn points. Repeats and self-actions don't count. Unlike or hidden content loses credit.</p>
        <p className="mt-3 text-sm leading-relaxed text-t3">Older undated likes and votes count in All time only, up to one daily allowance.</p>
        {helpersDelayed && <p role="status" className="mt-3 text-sm leading-relaxed text-t3">Help totals are updating. Your last confirmed points stay visible.</p>}
        {communityDelayed && <p role="status" className="mt-3 text-sm leading-relaxed text-t3">Community activity scores are updating. Your last saved points stay visible.</p>}
      </DialogContent>
    </Dialog>
  );
}
