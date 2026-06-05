export type DemoTourMode = "guided" | "practice" | "presentation";

export type DemoTourWaitFor =
  | "town-hall-posted"
  | "agent-replied"
  | "file-uploaded";

export type DemoTourStep = {
  id: string;
  route: string;
  title: string;
  section: string;
  narration: string;
  objective: string;
  highlightSelector?: string;
  practicePrompt?: string;
  waitFor?: DemoTourWaitFor;
};

export const DEMO_TOUR_ACTIVE_KEY = "agb.demoTour.active";
export const DEMO_TOUR_STEP_KEY = "agb.demoTour.stepId";
export const DEMO_TOUR_MODE_KEY = "agb.demoTour.mode";
export const DEMO_TOUR_COMPLETED_KEY = "agb.demoTour.completedSteps";

export const DEMO_TOUR_START_EVENT = "agb:demo-tour:start";
export const DEMO_TOUR_STOP_EVENT = "agb:demo-tour:stop";
export const DEMO_TOUR_TOWN_HALL_POSTED_EVENT = "agb:demo:town-hall-posted";
export const DEMO_TOUR_AGENT_REPLIED_EVENT = "agb:demo:agent-replied";
export const DEMO_TOUR_FILE_UPLOADED_EVENT = "agb:demo:file-uploaded";

export const DEMO_TOUR_STEPS: DemoTourStep[] = [
  {
    id: "mission-frame",
    route: "/",
    section: "Mission",
    title: "Why this platform exists",
    narration:
      "Welcome, sir. This platform exists to help the team create impact in Venezuela and win. Organization creates speed. Radical truth and radical transparency keep that speed aimed at reality. Phase one is about getting organized, prepared, and mission ready to win.",
    objective:
      "Anchor the whole demo in impact, Venezuela, speed, truth, transparency, and winning.",
    highlightSelector: "#main-content",
  },
  {
    id: "home-command-center",
    route: "/",
    section: "Day to day",
    title: "Home is the command center",
    narration:
      "Home is the daily operating picture. Tasks, meetings, blockers, projects, briefing notes, sprint health, treasury, and Town Hall activity come together so the team can see what matters now.",
    objective:
      "Use Home at the beginning of the day to decide what deserves attention first.",
    highlightSelector: "#main-content",
  },
  {
    id: "town-hall-transparency",
    route: "/town-hall",
    section: "Day to day",
    title: "Town Hall creates radical transparency",
    narration:
      "Town Hall is where the team tells the truth in public. Updates, blockers, asks, decisions, mentions, project references, and document references should live here instead of disappearing into private chats.",
    objective:
      "Use Town Hall to make work visible and keep the team aligned without private-channel drift.",
    practicePrompt:
      "Post a short demo update. Example: @all Demo update: we are aligning around the mission and capturing next steps here.",
    waitFor: "town-hall-posted",
    highlightSelector: "#main-content",
  },
  {
    id: "inbox-attention",
    route: "/inbox",
    section: "Day to day",
    title: "Inbox manages attention",
    narration:
      "The Inbox is the action layer for attention. Mentions, reminders, assignments, and resurfaced items land here so important work does not depend on memory.",
    objective:
      "Use Inbox to decide what requires a response, what can be snoozed, and what is already handled.",
    highlightSelector: "#main-content",
  },
  {
    id: "my-work-accountability",
    route: "/work",
    section: "Day to day",
    title: "My Work shows what each person owes",
    narration:
      "My Work turns the shared mission into personal accountability. Open tasks, milestones, and Overlord work come together so each teammate knows what they owe next.",
    objective:
      "Use My Work to filter by theme, project, or venture and keep personal execution clean.",
    highlightSelector: "#main-content",
  },
  {
    id: "meetings-capture",
    route: "/meetings",
    section: "Day to day",
    title: "Meetings become execution inputs",
    narration:
      "Meetings are not just calendar events. They are relationship and execution inputs. Notes, decisions, attendees, and action items should be captured so conversation turns into work.",
    objective:
      "Use Meetings to preserve context and convert discussion into follow-up.",
    highlightSelector: "#main-content",
  },
  {
    id: "agent-copilot",
    route: "/agent",
    section: "Day to day",
    title: "Agent lets you talk to the CRM",
    narration:
      "The Agent is the same operating brain available inside the CRM. Ask what to focus on, request a recap, log an update, or capture something by voice.",
    objective:
      "Use Agent when typing or speaking is faster than clicking through screens.",
    practicePrompt: "Ask the Agent: what should I focus on today?",
    waitFor: "agent-replied",
    highlightSelector: "#main-content",
  },
  {
    id: "priorities-scoreboard",
    route: "/priorities",
    section: "Setup",
    title: "Priorities define the scoreboard",
    narration:
      "Priorities define what winning means right now. Without a scoreboard, speed becomes noise. This is where the team aligns around the few outcomes that matter.",
    objective:
      "Use Priorities to keep execution tied to measurable outcomes.",
    highlightSelector: "#main-content",
  },
  {
    id: "review-truth-cadence",
    route: "/review",
    section: "Setup",
    title: "Weekly Review is the truth cadence",
    narration:
      "Weekly Review is the accountability ritual. What happened, what changed, what is blocked, and what must become true next week should be written down.",
    objective:
      "Use Weekly Review to make reality explicit and adjust the plan.",
    highlightSelector: "#main-content",
  },
  {
    id: "roadmap-sprint",
    route: "/sprint",
    section: "Setup",
    title: "Roadmap and sprint plan the fight",
    narration:
      "The roadmap is the larger campaign. The sprint is the current fight. Strategy stays visible, while the sprint turns strategy into short-window execution.",
    objective:
      "Use Sprint to see the current execution window and what needs to move next.",
    highlightSelector: "#main-content",
  },
  {
    id: "pipeline-projects",
    route: "/pipeline",
    section: "Setup",
    title: "Every serious push becomes a project",
    narration:
      "AGB does not only track contacts. Every meaningful relationship, deal, campaign, or operating push becomes a project with owners, milestones, materials, blockers, and a next step.",
    objective:
      "Use Pipeline and Projects to make progress visible from first contact to outcome.",
    highlightSelector: "#main-content",
  },
  {
    id: "materials-documents",
    route: "/projects",
    section: "Setup",
    title: "Materials stay attached to the work",
    narration:
      "Materials should live with the project they support. Links, uploaded files, and collaborative documents keep execution context attached to the work instead of scattered across chat, drives, and memory.",
    objective:
      "Open a project, review links, upload materials, or create a project document.",
    practicePrompt:
      "Open any project. Review the materials area, then upload or queue a demo file if the workspace is safe for practice.",
    waitFor: "file-uploaded",
    highlightSelector: "#main-content",
  },
  {
    id: "explorer-reference",
    route: "/contacts",
    section: "Explorer",
    title: "Explorer is the reference layer",
    narration:
      "Explorer is the reference layer. Contacts show who matters. Network shows the warm path. Team shows ownership. Treasury shows operating reality. Research keeps intelligence close to execution.",
    objective:
      "Use Explorer when you need context before taking action.",
    highlightSelector: "#main-content",
  },
  {
    id: "workspace-settings",
    route: "/settings",
    section: "Setup",
    title: "Workspace and settings configure the system",
    narration:
      "Workspace and Settings configure the operating system. This is where preferences, profile, ÑIGO behavior, DEMON mode, and future demo settings live.",
    objective:
      "Use Settings to adjust the experience and keep the operating system matched to the team.",
    highlightSelector: "#main-content",
  },
  {
    id: "closing",
    route: "/",
    section: "Mission",
    title: "Mission ready to win",
    narration:
      "That is phase one. The platform organizes the team, makes the truth visible, turns conversation into work, connects materials to projects, and prepares the team to move faster. The mission is simple: create impact in Venezuela, stay transparent, and win.",
    objective:
      "Leave the tour knowing where to start each day and how the platform supports the mission.",
    highlightSelector: "#main-content",
  },
];

export function demoTourAudioSrc(stepId: string): string {
  return `/demo-tour/${stepId}.mp3`;
}

export function demoTourStepIndex(stepId: string | null | undefined): number {
  const index = DEMO_TOUR_STEPS.findIndex((step) => step.id === stepId);
  return index >= 0 ? index : 0;
}

export function demoTourWaitEvent(waitFor: DemoTourWaitFor): string {
  if (waitFor === "town-hall-posted") return DEMO_TOUR_TOWN_HALL_POSTED_EVENT;
  if (waitFor === "agent-replied") return DEMO_TOUR_AGENT_REPLIED_EVENT;
  return DEMO_TOUR_FILE_UPLOADED_EVENT;
}
