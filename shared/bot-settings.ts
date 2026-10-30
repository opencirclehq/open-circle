import type { CommunitySettings, CoordinationPolicy } from "./coordination.js";

const option = <T extends boolean | number>(label: string, section: string, description: string, value: T, min = 0, max = 0) => ({ label, section, description, value, min, max });

export const BOT_OPTION_FIELDS = {
  weeklyEngagementEnforcement: option("Weekly inactivity warnings and removal", "moderation", "Tag inactive members Tuesday, Thursday and Saturday at 19:00. Remove on Monday after a fully observed week and three delivered warnings. Admins, settling-in members, breaks and incomplete weeks are protected. Off until enabled.", false),
  welcomeEnabled: option("Welcome new members", "welcome", "Queue newcomers for the next scheduled batch. Turning this off keeps the queue for later.", true),
  welcomeGreetingEnabled: option("Send a separate greeting", "welcome", "Send the greeting before the instructions. Both messages share one batch.", true),
  welcomeTagging: option("Tag newcomers", "welcome", "Use real WhatsApp mentions in the greeting. Turning this off sends no newcomer tags.", true),
  welcomeInstructionsEnabled: option("Include getting started instructions", "welcome", "Include the introduction, signup steps and rules pointer when welcoming newcomers. The first coordination announcement still introduces the routine.", true),
  groupBatchLimit: option("Maximum group batches in 24 hours", "schedule", "A greeting and its instructions count as one batch. Empty batches are skipped; missed batches are not replayed.", 3, 1, 3),
  spotlightEnabled: option("Project spotlights", "automation", "Choose approved projects fairly and assign available reviewers.", true),
  weeklyHelpEnabled: option("Weekly help requests", "automation", "Share open questions in the selected batch.", true),
  reviewChallengeEnabled: option("Weekly review challenge", "automation", "Invite members to try an approved project and share useful feedback.", true),
  weeklyThanksEnabled: option("Weekly contribution roundup", "automation", "Share confirmed contribution totals from the last seven days.", true),
  spotlightDayOne: option("First spotlight day", "automation", "0 is Sunday, 1 Monday, through 6 Saturday.", 2, 0, 6),
  spotlightDayTwo: option("Second spotlight day", "automation", "0 is Sunday, 1 Monday, through 6 Saturday.", 4, 0, 6),
  spotlightSlot: option("Spotlight batch", "automation", "Choose the first, second or third batch.", 2, 0, 2),
  weeklyHelpDay: option("Help requests day", "automation", "Choose the weekday for the weekly questions post.", 1, 0, 6),
  weeklyHelpSlot: option("Help requests batch", "automation", "Choose the first, second or third batch.", 0, 0, 2),
  reviewChallengeDay: option("Review challenge day", "automation", "Choose the weekday for the review challenge.", 3, 0, 6),
  reviewChallengeSlot: option("Review challenge batch", "automation", "Choose the first, second or third batch.", 1, 0, 2),
  weeklyThanksDay: option("Contribution roundup day", "automation", "Choose the weekday for the confirmed contribution totals.", 5, 0, 6),
  weeklyThanksSlot: option("Contribution roundup batch", "automation", "Choose the first, second or third batch.", 2, 0, 2),
  spotlightReviewers: option("Reviewers per spotlight", "automation", "Only available, linked members who do not own the project can be assigned.", 2, 1, 5),
  spotlightCooldownDays: option("Days before repeating a spotlight", "automation", "Projects with fewer confirmed reviews are considered first.", 14, 7, 60),
  weeklyBoardDay: option("Developer board snapshot day", "automation", "The public board snapshot uses the selected catch-up batch.", 5, 0, 6),
  repositoryFollowupHours: option("Repository follow-up after hours", "automation", "Send one follow-up for an announced repository still looking for help.", 48, 24, 168),
  privateDigestsEnabled: option("Automatic private digests", "notifications", "Combine reminders, assignments and confirmations into at most one private message per member per day.", true),
  participationReminders: option("Participation reminders", "notifications", "Send a private reminder after the configured observed inactivity period.", true),
  participationWarnings: option("Participation warnings", "notifications", "Send a private final warning. Removal still needs a human review and seven observed days after a delivered warning.", true),
  reviewAssignments: option("Private review assignments", "notifications", "Tell members about their assigned project reviews.", true),
  reviewFollowups: option("Private review follow-ups", "notifications", "Send one reminder for an unanswered review assignment.", true),
  reviewReminderDays: option("Review reminder after observed days", "notifications", "Offline time and approved breaks do not count.", 3, 1, 14),
  mentorNotifications: option("Private mentor matches", "notifications", "Notify volunteers about a matching question within their chosen weekly limit.", true),
  feedbackConfirmations: option("Private confirmation reminders", "notifications", "Ask recipients to confirm whether recorded feedback was useful.", true),
  commandsEnabled: option("Private command replies", "notifications", "Allow bot commands, including account linking. Group /link commands remain silent.", true),
  commandCooldownSeconds: option("Seconds between command replies", "notifications", "A member cannot receive replies more often than this.", 30, 30, 600),
  commandDailyLimit: option("Command replies per member in 24 hours", "notifications", "This limit does not increase the automatic private-digest allowance.", 20, 1, 20),
  spamDetection: option("Flag repeated messages and links", "moderation", "Create a case for admin review. This never automatically deletes messages or removes members.", true),
  spamWindowMinutes: option("Spam observation window in minutes", "moderation", "Check repeated text and link messages within this rolling window.", 10, 1, 60),
  spamRepeatedMessages: option("Repeated messages before a flag", "moderation", "Count identical messages from the same member in the group only.", 3, 2, 20),
  spamLinkMessages: option("Link messages before a flag", "moderation", "Count group messages containing a link, not the number of links inside one message.", 5, 3, 30),
} as const;

type BotOptionValues = { -readonly [K in keyof typeof BOT_OPTION_FIELDS]: typeof BOT_OPTION_FIELDS[K]["value"] extends boolean ? boolean : number };
export type BotOptions = Omit<BotOptionValues, "weeklyEngagementEnforcement"> & Partial<Pick<BotOptionValues, Extract<keyof BotOptionValues, "weeklyEngagementEnforcement">>>;
export const defaultBotOptions = (): Required<BotOptions> => Object.fromEntries(Object.entries(BOT_OPTION_FIELDS).map(([key, field]) => [key, field.value])) as Required<BotOptions>;

const template = (label: string, section: string, description: string, body: string, variables: readonly string[], required: readonly string[] = []) => ({ label, section, description, body, variables, required, maxLength: 6000 });

export const MESSAGE_TEMPLATES = {
  welcomeGreeting: template("New member greeting", "Welcome", "The separate greeting. The members variable becomes real WhatsApp tags only when tagging is on.", "*Welcome to Open Source Circle!*\n\nWelcome to our {{count}} new {{member_word}}:\n{{members}}\n\n{{website_url}}", ["count", "member_word", "members", "website_url"]),
  welcomeIntro: template("First introduction", "Welcome", "The introduction sent before participation observation starts.", "*Open Source Circle: how it works*\n\nWe share projects, give useful feedback and help each other build.", []),
  welcomeNewIntro: template("Newcomer introduction", "Welcome", "The introduction before the signup steps for newcomers.", "Introduce yourself and tell us what you're building. Try other members' projects and share feedback that helps them improve.", []),
  welcomeSteps: template("Getting started steps", "Welcome", "Signup and participation instructions.", "*How to get started*\nStart here and catch up: {{participation_url}}#start\n1. Open {{website_url}} and choose Rank me. Add your GitHub username, nickname and the WhatsApp number you use in this group.\n2. Sign in with GitHub at {{participation_url}} and connect your WhatsApp account.\n3. On that page, share projects, give feedback, ask or answer questions, confirm feedback, check your progress and request a break.", ["website_url", "participation_url"], ["participation_url"]),
  welcomeRules: template("Rules pointer", "Welcome", "Shown after the welcome instructions.", "Read the group description for the rules.", []),
  spotlight: template("Project spotlight", "Group posts", "A fair spotlight of an approved project.", "Project spotlight: {{title}} by {{owner}}\n{{url}}\n{{feedback}}Try it and share one useful observation at {{participation_url}}.{{reviewers}}", ["title", "owner", "url", "feedback", "participation_url", "reviewers"], ["url", "participation_url"]),
  weeklyHelp: template("Weekly help requests", "Group posts", "Open questions, with their request identifiers.", "This week's help requests:\n{{requests}}\nRead and answer them at {{participation_url}}.", ["requests", "participation_url"], ["requests", "participation_url"]),
  reviewChallenge: template("Weekly review challenge", "Group posts", "Encourage useful feedback on approved projects.", "This week's small challenge: try one member's project and share a concrete improvement. Find a project and record your feedback at {{participation_url}}.", ["participation_url"], ["participation_url"]),
  weeklyThanks: template("Weekly contribution totals", "Group posts", "Counts come only from confirmed contributions.", "This week: {{count}} confirmed contributions across {{targets}} projects and help requests. Thanks for helping each other build.", ["count", "targets"], ["count", "targets"]),
  participationReminder: template("Participation reminder", "Private reminders", "A friendly reminder after the observed inactivity period.", "A friendly OpenCircle reminder: try a member's project or help with a question. Manage your activity and request a break at {{participation_url}}. Your feedback needs the owner or an admin to confirm it.", ["participation_url"], ["participation_url"]),
  participationWarning: template("Final participation warning", "Private reminders", "The reason reflects the actual inactivity or two completed low periods. Removal safeguards stay enforced.", "Your OpenCircle participation needs attention. {{reason}} Please review a project or answer a help request. You have at least seven observed days before an admin can review removal. Check your activity, pending feedback or request a break at {{participation_url}}.", ["reason", "participation_url"], ["reason", "participation_url"]),
  reviewAssignment: template("Review assignment", "Private reminders", "First invitation to review an assigned project.", "A project to review: {{title}}\n{{url}}\nShare what you tried and a useful observation at {{participation_url}}.", ["title", "url", "participation_url"], ["url", "participation_url"]),
  reviewFollowup: template("Review assignment reminder", "Private reminders", "One follow-up after the configured observed days.", "A reminder for your assigned review: {{title}}\n{{url}}\nShare what you tried and a useful observation at {{participation_url}}.", ["title", "url", "participation_url"], ["url", "participation_url"]),
  mentorAssignment: template("Mentor match", "Private reminders", "A matching question for an opted-in volunteer.", "A question matches your volunteer skills: {{question}}\nAnswer or decline at {{participation_url}} (request {{id}}).", ["question", "participation_url", "id"], ["question", "participation_url"]),
  feedbackConfirmation: template("Confirm received feedback", "Private reminders", "Ask the recipient to confirm a recorded contribution.", "You have feedback to confirm: {{id}}. Read it privately and confirm whether it is useful at {{participation_url}}.", ["id", "participation_url"], ["id", "participation_url"]),
  spamWarning: template("Admin spam warning", "Moderation", "Sent only when an admin chooses to warn a member.", "An OpenCircle admin has asked you to stop repeated messages or excessive link posting. Please keep the group focused on useful project feedback and help.", []),
  adminWarning: template("Admin participation warning", "Moderation", "A human-reviewed final warning; the seven observed-day safeguard is unchanged.", "An OpenCircle admin has reviewed your participation. Please give useful project feedback or answer a help request. You have at least seven observed days before a removal decision. Check your activity or request a break at {{participation_url}}.", ["participation_url"], ["participation_url"]),
  linked: template("Account linked", "Command replies", "Confirmation after a valid linking code is claimed by the correct sender.", "Your WhatsApp account is linked to {{login}}. Manage your participation at {{participation_url}}.", ["login", "participation_url"], ["login", "participation_url"]),
  activityRedirect: template("Activity and rules redirect", "Command replies", "Reply to /activity, /rule and /rules.", "Manage your activity, projects, feedback and breaks at {{participation_url}}. The rules are in the group description.", ["participation_url"], ["participation_url"]),
  start: template("Start command", "Command replies", "Reply to a private /start command.", "Start here: {{participation_url}}#start\nJoin the website, connect your WhatsApp account, then try a project or ask a clear question. Read the group description for the rules.", ["participation_url"], ["participation_url"]),
  catchup: template("Catch-up command", "Command replies", "The latest published update and archive link.", "{{update}}\n\nPrevious updates: {{participation_url}}#catch-up", ["update", "participation_url"], ["update", "participation_url"]),
  catchupEmpty: template("No catch-up updates", "Command replies", "Reply before the first update exists.", "No catch-up updates have been published yet. Start here: {{participation_url}}#start", ["participation_url"]),
  sessions: template("Sessions command", "Command replies", "Upcoming sessions in the configured timezone.", "{{sessions}}", ["sessions"], ["sessions"]),
  sessionsEmpty: template("No upcoming sessions", "Command replies", "Reply when no sessions are scheduled.", "No community sessions are scheduled yet.", []),
  projects: template("Projects command", "Command replies", "Approved projects awaiting feedback.", "{{projects}}\nUse /review ID with what you tried and a useful observation.", ["projects"], ["projects"]),
  projectsEmpty: template("No approved projects", "Command replies", "Reply when the project review list is empty.", "No approved projects are awaiting review yet. Share one with /project URL title.", []),
  help: template("Help command", "Command replies", "Open questions, including request identifiers.", "{{requests}}", ["requests"], ["requests"]),
  helpEmpty: template("No open questions", "Command replies", "Reply when there are no open help requests.", "No open help requests. Use /help followed by a clear question.", []),
  projectQueued: template("Project submitted", "Command replies", "A project still needs admin approval.", "Your project is queued for admin approval.", []),
  breakQueued: template("Break requested", "Command replies", "A break still needs admin approval.", "Your break request is queued for admin approval.", []),
  contributionQueued: template("Contribution recorded", "Command replies", "Credit is not granted until confirmation.", "Your contribution is recorded and awaits confirmation by the recipient or an admin.", []),
  saved: template("Action saved", "Command replies", "Successful confirmation, answer closure or mentor preference update.", "Saved. View your participation at {{participation_url}}.", ["participation_url"]),
  commandError: template("Command error", "Command replies", "The actual validation or permission error remains present.", "{{error}}", ["error"], ["error"]),
  unknownCommand: template("Unknown command", "Command replies", "Reply when a command is not supported.", "Manage your participation at {{participation_url}}. The rules are in the group description.", ["participation_url"]),
  linkRequired: template("Account link required", "Command replies", "Reply when a command requires a verified account link.", "Connect your WhatsApp account from your signed-in profile at {{participation_url}}.", ["participation_url"], ["participation_url"]),
  catchupHeading: template("Daily catch-up heading", "Catch-up", "Date uses the bot's timezone.", "OpenCircle catch-up · {{date}}", ["date"]),
  catchupProjects: template("New projects section", "Catch-up", "Approved projects added in the last day.", "Projects to try:\n{{projects}}", ["projects"], ["projects"]),
  catchupHelp: template("Unanswered questions section", "Catch-up", "Open questions without a pending or confirmed answer.", "Still looking for help:\n{{requests}}", ["requests"], ["requests"]),
  catchupThanks: template("Daily contribution totals", "Catch-up", "Confirmed useful contributions from the last day.", "{{count}} useful contributions confirmed today. Thank you to everyone who helped.", ["count"], ["count"]),
  catchupEmptyGroup: template("Quiet day message", "Catch-up", "Daily catch-up when there are no new structured updates.", "No new updates today. You can still find projects and questions on the website.", []),
  catchupFooter: template("Catch-up link", "Catch-up", "The final archive and participation link.", "Catch up and take part: {{participation_url}}#catch-up", ["participation_url"], ["participation_url"]),
  sessionLine: template("Upcoming session line", "Catch-up", "Title, local time and timezone of a real scheduled session.", "{{title}}: {{time}} ({{timezone}}).", ["title", "time", "timezone"], ["title", "time", "timezone"]),
  repositoryLaunch: template("Repository announcement", "Repositories", "An approved open-source repository. Optional details include skills and starter issues.", "{{owner}} built this open-source project:\n\n*{{repository}}*\n{{summary}}\n\n{{url}}\n\n*Help wanted:* {{help_wanted}}{{skills}}{{issues}}\n\n*Licence:* {{license}}{{fork}}\n\nFind this and other submissions:\n{{participation_url}}#repositories", ["repository", "summary", "url", "help_wanted", "skills", "issues", "owner", "license", "fork", "participation_url"], ["repository", "url", "help_wanted", "license", "participation_url"]),
  repositoryFollowup: template("Repository follow-up", "Repositories", "A single follow-up for an announced project still accepting help.", "{{owner}} is still looking for contributors:\n\n*{{repository}}*\n{{summary}}\n\n{{url}}\n\n*Help wanted:* {{help_wanted}}{{skills}}{{issues}}\n\n*Licence:* {{license}}{{fork}}\n\nFind this and other submissions:\n{{participation_url}}#repositories", ["repository", "summary", "url", "help_wanted", "skills", "issues", "owner", "license", "fork", "participation_url"], ["repository", "url", "help_wanted", "license", "participation_url"]),
  repositoryMaintainers: template("Repository owner tags", "Repositories", "Only consenting owners are mentioned, in the configured main group.", "Maintainers: {{members}}", ["members"], ["members"]),
  feedbackSection: template("Feedback wanted line", "Reusable sections", "The optional feedback request inside a project spotlight.", "Feedback wanted: {{feedback}}", ["feedback"], ["feedback"]),
  reviewersSection: template("Assigned reviewers line", "Reusable sections", "The reviewer names included in a project spotlight.", "Reviewers: {{reviewers}}.", ["reviewers"], ["reviewers"]),
  skillsSection: template("Repository skills section", "Reusable sections", "The optional skill names inside repository announcements.", "*Skills:* {{skills}}", ["skills"], ["skills"]),
  issuesSection: template("Starter issues section", "Reusable sections", "The verified issue links inside repository announcements.", "*Starter issues:*\n{{issues}}", ["issues"], ["issues"]),
  forkDisclosure: template("Fork disclosure", "Reusable sections", "Included only when GitHub verifies the repository is a fork.", "This repository is a fork.", []),
  boardHeading: template("Developer board heading", "Developer board", "The heading above the verified top three.", "This week's developer board snapshot:", []),
  boardRow: template("Developer board member row", "Developer board", "A real ranking, login and score. Helps is an optional section with confirmed contribution totals.", "{{rank}}. {{login}} · {{score}} points{{helps}}", ["rank", "login", "score", "helps"], ["rank", "login", "score"]),
  boardHelps: template("Developer board help total", "Developer board", "Only present when helper totals are current and verified.", "{{count}} confirmed helps", ["count"], ["count"]),
  boardHelperUpdated: template("Helper totals timestamp", "Developer board", "The actual update time of the helper totals.", "Helper scores updated {{time}}.", ["time"], ["time"]),
  boardStatsUpdated: template("GitHub totals timestamp", "Developer board", "The actual update time of the GitHub totals.", "GitHub stats updated {{time}}.", ["time"], ["time"]),
  boardLink: template("Developer board link", "Developer board", "The link to the current public board.", "See the current board: {{website_url}}", ["website_url"], ["website_url"]),
  weeklyBoard: template("Developer board snapshot", "Group posts", "The snapshot includes only verified public board data. It never invents activity or includes delayed helper totals.", "{{snapshot}}", ["snapshot"], ["snapshot"]),
} as const;

export type MessageKey = keyof typeof MESSAGE_TEMPLATES;
export type BotMessages = Record<MessageKey, string>;
export const defaultBotMessages = (): BotMessages => Object.fromEntries(Object.entries(MESSAGE_TEMPLATES).map(([key, field]) => [key, field.body])) as BotMessages;
export const BOT_SETTINGS_MAX_BYTES = 1048576;
export interface BotSettingsConfig { policy: CoordinationPolicy; community: CommunitySettings; options: BotOptions; messages: BotMessages }
export interface BotSettingsState extends BotSettingsConfig {
  version: number;
  status: { connected: boolean; botAdmin: boolean; groupOpen: boolean | null; tracking: boolean; announced: boolean; lastCheckAt: number | null; pendingWelcomes: number; uncertainDeliveries: number; lastDeliveryError?: string | null; consoleUrl: string };
}
export interface BotSettingsInput extends BotSettingsConfig { version: number }
export const MESSAGE_PREVIEW_VALUES: Record<string, string> = {
  rank: "1", score: "85", helps: " · 3 confirmed helps",
  website_url: "https://opencircle.cc", participation_url: "https://opencircle.cc/participation", count: "3", member_word: "members", members: "@newmember\n@anothermember\n@builder", title: "Community task board", owner: "example-builder", login: "example-builder", url: "https://github.com/example/task-board", feedback: "Feedback wanted: test the signup flow.\n", reviewers: "\nReviewers: Alex, Sam.", requests: "help_example: How can I improve the keyboard navigation?", targets: "2", reason: "We haven't recorded confirmed help during the warning period.", question: "How can I improve keyboard navigation?", id: "feedback_example", update: "We are testing an accessible task board this week.", sessions: "Community help session: 21 Oct, 18:00 (Africa/Lagos)", projects: "project_example: Community task board\nhttps://github.com/example/task-board", error: "That linking code has expired. Get a new code from your website profile.", date: "2026-10-15", time: "18:00", timezone: "Africa/Lagos", repository: "example/task-board", summary: "An accessible board for small teams.", help_wanted: "Test keyboard navigation and improve the setup guide.", skills: "\nSkills: React, TypeScript", issues: "\nStarter issues:\nhttps://github.com/example/task-board/issues/1", license: "MIT", fork: "", snapshot: "OpenCircle developer board snapshot\n1. example-builder — 3 confirmed helps",
};
export function renderMessageTemplate(body: string, values: Record<string, string | number>): string {
  return body.replace(/\{\{([a-z_]+)\}\}/g, (_match, key: string) => String(values[key] ?? "")).trim();
}

export function messageTemplateError(key: MessageKey, value: unknown): string | null {
  const field = MESSAGE_TEMPLATES[key];
  if (typeof value !== "string" || !value.trim() || value.length > field.maxLength || Array.from(value).some((character) => { const code = character.charCodeAt(0); return code === 127 || code < 32 && ![9, 10, 13].includes(code); })) return `${field.label}: add a message of up to ${field.maxLength} characters.`;
  const variables = [...value.matchAll(/\{\{([a-z_]+)\}\}/g)].map((match) => match[1]);
  const rest = value.replace(/\{\{([a-z_]+)\}\}/g, "");
  if (rest.includes("{{") || rest.includes("}}") || variables.some((name) => !field.variables.includes(name))) return `${field.label}: use only the listed message variables, with two braces on each side.`;
  if (field.required.some((name) => !variables.includes(name))) return `${field.label}: keep ${field.required.map((name) => `{{${name}}}`).join(", ")} in the message.`;
  return null;
}
