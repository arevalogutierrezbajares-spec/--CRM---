# ÑIGO Guided Demo Tour

## Purpose

Build an opt-in guided demo mode that gives a full platform overview with ÑIGO
narrating the experience while the user moves through key workflows.

The demo starts macro:

> This platform exists to help the team create real impact in Venezuela and win.
> Organization creates speed. Radical truth and radical transparency keep that
> speed aimed at reality. In this first phase, the job is simple: get the team
> organized, prepared, and mission ready to win.

Then it moves from day-to-day operating surfaces into higher-level setup and
planning surfaces, always tying the functionality back to execution quality,
team readiness, and the objective of winning in Venezuela.

## Demo Principles

- ÑIGO guides, but the user does the work.
- The demo should pause at real interaction moments, not just autoplay a video.
- Every stop should answer: what is this for, when do I use it, and what action
  should I take here?
- Use real app routes and components. Avoid a fake marketing tour.
- Keep narration approved and pre-rendered where possible, using the same
  ÑIGO voice pipeline as greetings and DEMON mode.
- Prefer a seeded demo workspace or demo-safe fixtures for destructive actions.

## Demo Modes

### 1. Guided Overview

Primary mode for onboarding a teammate or investor/operator.

- ÑIGO navigates screen by screen.
- Highlights key regions.
- Pauses for user actions.
- Resumes after the user clicks "Continue" or completes the target action.

### 2. Operator Practice

Shorter, action-heavy mode.

- User posts in Town Hall.
- Adds/updates work.
- Opens a project.
- Uploads or reviews materials.
- Creates or edits a planning item.

### 3. Narrated Walkthrough

Mostly autoplay for a live presentation.

- Same route order.
- Fewer pauses.
- Useful when Tomas is screen-sharing and wants ÑIGO to carry the overview.

## Narrative Arc

### Act 0 — Mission Frame

Route: `/`

Narration:

> Good {period}, {Sir}. Welcome to AGB CRM. The purpose of this platform is not
> to store information. The purpose is to help this team create impact in
> Venezuela and win. Organization creates preparedness. Preparedness creates
> speed. Speed, guided by radical truth and radical transparency, makes the team
> mission ready to win.

Focus:

- This is the operating system for AGB.
- The first phase is about getting the team organized and prepared.
- The platform turns relationships, projects, tasks, meetings, files, and team
  communications into one shared operating picture.
- The shared operating picture exists so the team can move faster, make better
  decisions, and execute with impact in Venezuela.

Pause:

- User clicks "Begin demo".

### Act 1 — Day-To-Day Command Center

Route: `/`

Narration:

> The Home page is the daily command center. It shows what matters today: tasks,
> meetings, active projects, blockers, briefing notes, sprint health, treasury,
> and the latest Town Hall activity.

Show:

- Greeting and quote area.
- Daily/weekly/monthly view switch.
- Today tasks.
- Meetings agenda.
- Active projects.
- Right rail widgets: AI briefing, pipeline snapshot, sprint, treasury.
- Town Hall panel in the dashboard rail.

Pause:

- User switches Daily → Weekly → Monthly.
- User opens one item drawer from Home.

### Act 2 — Town Hall: Radical Transparency In Motion

Route: `/town-hall`

Narration:

> Town Hall is where the team tells the truth in public. Updates, asks,
> blockers, references, and decisions should happen here instead of disappearing
> into private chats. Mention people with @, reference projects with #, and keep
> the team aligned.

Show:

- Feed.
- Composer.
- @mentions.
- #project references.
- @document references.
- Notifications from mentions and assignments.
- Optional WhatsApp fan-out when enabled.

User task:

- Post a short update:
  `@all Demo update: we are aligning around #<project> and capturing next steps here.`

Future enhancement:

- Add a "Create task from Town Hall" action directly from a post.
- Add a "Convert post to project update" action.
- Add a "Attach referenced docs to project" action when a post references docs.

Pause:

- Resume only after the user posts or clicks "Skip practice".

### Act 3 — Inbox And Notifications

Route: `/inbox`

Narration:

> The Inbox is the action layer for attention. Mentions, reminders, assignments,
> and resurfaced items land here so nothing important depends on memory.

Show:

- Unread notifications.
- Snooze behavior.
- Click-through to referenced work.
- ÑIGO notification voice cue: "You have got a notification, sir."

Pause:

- User opens one notification or marks one item read.

### Act 4 — My Work: What Each Person Owes The Mission

Route: `/work`

Narration:

> My Work turns the shared mission into personal accountability. This is where
> open tasks, milestones, and Overlord work come together so each person knows
> what they owe next.

Show:

- Open work list.
- Filters by venture/theme/project.
- Status and due dates.
- Work tied back to initiatives and projects.

Pause:

- User filters work by a project or theme.

### Act 5 — Meetings And Call Capture

Routes: `/meetings`, `/record`

Narration:

> Meetings are not just calendar events. They are relationship and execution
> inputs. Notes, decisions, attendees, action items, and follow-ups should be
> captured here so the system can turn conversation into work.

Show:

- Meeting list.
- Meeting detail.
- Meeting notes.
- Live call recorder.
- Voice transcription routes for future capture workflows.

Pause:

- User opens a meeting or starts a sample call-recording flow if credentials are
  configured.

### Act 6 — Agent: Talk To The CRM

Route: `/agent`

Narration:

> The Agent is the same brain behind the WhatsApp bot, available inside the CRM.
> Ask what to focus on, log an update, request a recap, or capture something by
> voice.

Show:

- Chat input.
- Suggested prompts.
- Hold-to-record voice input.
- Tool call metadata.

User task:

- Ask: `what should I focus on today?`

Pause:

- Resume after the agent returns a reply or the user skips.

## Setup And Planning Arc

### Act 7 — Priorities: Define The Scoreboard

Route: `/priorities`

Narration:

> Priorities define what winning means right now. Without a scoreboard, speed
> becomes noise. This is where the team aligns around the few outcomes that
> matter.

Show:

- KPIs.
- Priority board.
- Current targets.

Pause:

- User opens KPI settings or reviews one priority.

### Act 8 — Weekly Review: Radical Truth Cadence

Route: `/review`

Narration:

> Weekly Review is the accountability ritual. What happened, what changed, what
> is blocked, and what must become true next week?

Show:

- Review notes.
- Outcomes and blockers.
- Follow-up actions.

Pause:

- User writes one review note or marks a sample review item.

### Act 9 — Roadmap And Sprint: Plan The Fight

Routes: `/roadmap`, `/sprint`

Narration:

> Roadmap is the larger campaign. Sprint is the current fight. The roadmap keeps
> strategy visible; the sprint turns strategy into a short execution window.

Show:

- Roadmap initiatives.
- Themes.
- Sprint columns and active sprint widget.
- Relationship between initiatives, tasks, and projects.

Pause:

- User opens one initiative or moves through sprint columns.

### Act 10 — Pipeline And Projects: Every Deal Is A Project

Routes: `/pipeline`, `/projects`, `/projects/new`, `/projects/[id]`

Narration:

> AGB does not only track contacts. Every meaningful relationship, deal,
> campaign, or operating push becomes a project with owners, milestones,
> materials, blockers, and a next step.

Show:

- Pipeline kanban.
- Project list.
- Project creation with templates.
- Project detail page.
- Milestones.
- Links/materials area.
- Health and status.

User task:

- Create a sample project from a template, or open an existing project and mark
  one milestone reviewed.

Pause:

- Resume after opening a project detail page.

### Act 11 — Materials And Documents

Route: `/projects/[id]`

Narration:

> Materials live with the project they support. Links, files, and live documents
> keep execution context attached to the work instead of scattered across chat,
> Drive, and memory.

Show:

- Links board.
- Upload tray.
- File queue and categories.
- Project docs.
- Collaborative doc editor.

User task:

- Upload a demo file or create/open a project document.

Pause:

- Resume after upload queue appears, upload completes, or user opens a doc.

### Act 12 — Explorer: Relationships, Network, Team, Treasury, Research

Routes: `/contacts`, `/network`, `/team`, `/treasury`, `/research`

Narration:

> Explorer is the reference layer. Contacts show who matters. Network shows the
> warm path. Team shows ownership. Treasury shows operating reality. Research
> keeps intelligence close to execution.

Show:

- Contacts grid.
- Contact detail.
- Network graph.
- Team page.
- Treasury summary.
- Research index.

Pause:

- User opens a contact and reviews linked projects or relationship path.

### Act 13 — Workspace And Settings

Routes: `/workspace`, `/settings`, `/profile`

Narration:

> Workspace and Settings configure the operating system: team members, profile,
> preferences, quote bubble, ÑIGO and DEMON mode, and future demo settings.

Show:

- Workspace configuration.
- Settings cards.
- ÑIGO/DEMON settings.
- Profile and timezone.

Pause:

- User toggles a demo preference or opens profile.

### Act 14 — Closing

Route: `/`

Narration:

> That is the first phase. The platform organizes the team, makes the truth
> visible, turns conversation into work, connects materials to projects, and
> prepares the team to move faster. The mission is simple: create impact in
> Venezuela, stay organized, stay transparent, and win.

End state:

- Show Home again.
- Offer buttons: "Restart", "Practice workflows", "Exit demo".

## Implementation Plan

### Data Model

Add a client-side tour registry first. Database persistence can come later.

```ts
type TourStep = {
  id: string;
  route: string;
  title: string;
  narration: string;
  audioSlug: string;
  highlight?: string;
  waitFor?: "continue" | "post-town-hall" | "open-project" | "upload-file" | "agent-reply";
  allowSkip?: boolean;
};
```

Store runtime state in localStorage:

- `agb.demoTour.active`
- `agb.demoTour.stepId`
- `agb.demoTour.mode`
- `agb.demoTour.completedSteps`

### Components

- `components/demo/demo-tour-provider.tsx`
  - Mounted in `app/(app)/layout.tsx`.
  - Owns active step, navigation, audio playback, highlights, and pauses.

- `components/demo/demo-tour-overlay.tsx`
  - Small bottom narration controller.
  - Buttons: Back, Continue, Skip practice, Exit.
  - Shows progress.

- `components/demo/demo-highlight.tsx`
  - Optional spotlight overlay using selectors or registered refs.

- `components/settings/demo-tour-card.tsx`
  - Start guided overview.
  - Start operator practice.
  - Reset progress.

### Audio Pipeline

- Keep narration scripts in `lib/demo-tour-script.ts`.
- Generate approved clips into `public/demo-tour/{stepId}.mp3`.
- Add script command:
  - `pnpm demo-tour:gen`
- Reuse ElevenLabs voice settings from `scripts/gen-greetings.ts`.

### Step Completion Hooks

The tour should not scrape arbitrary DOM when a first-class app event exists.

Add small custom events:

- Town Hall post succeeds → `agb:demo:town-hall-posted`
- Project opened → route match is enough
- File queued/uploaded → `agb:demo:file-uploaded`
- Agent reply received → `agb:demo:agent-replied`

The provider can listen for these events and unlock the next step.

### Demo Safety

Preferred:

- Create or seed a dedicated demo workspace.
- Demo actions write to demo data only.
- User can reset demo fixtures.

Minimum viable:

- Let user run actions in current workspace but make all practice steps skippable.
- Clearly label user-generated demo posts/files.

### Build Phases

#### Phase 1 — Scripted Guided Overview

- Tour registry.
- Overlay controller.
- Route navigation.
- ÑIGO narration playback.
- Continue/Back/Exit.
- No automated action detection yet.

#### Phase 2 — Interactive Pauses

- Town Hall post completion hook.
- Agent reply completion hook.
- Project/doc/file completion hooks.
- Practice mode.

#### Phase 3 — Demo Workspace

- Seed/reset demo data.
- Safe sample project.
- Safe sample files.
- Deterministic demo route state.

#### Phase 4 — Polished Presentation Mode

- Autoplay mode.
- Speaker notes.
- "Live demo" vs "self-guided onboarding" variants.
- Optional DEMON mode interjections disabled by default during formal demo.

## First Build Slice

The smallest valuable slice:

1. Add `lib/demo-tour-script.ts` with 12-15 steps.
2. Add `DemoTourProvider` in app layout.
3. Add overlay controls.
4. Add Settings card: "Start ÑIGO guided demo".
5. Generate 5-7 initial narration clips:
   - Mission frame
   - Home
   - Town Hall
   - My Work
   - Projects
   - Materials
   - Closing

This gets the demo usable without waiting for every interactive hook.
