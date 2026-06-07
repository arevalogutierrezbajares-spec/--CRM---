import type { PitchFeedbackSection } from "./types";

export const DEFAULT_FNF_CAMPAIGN_NAME = "AGB F&F Private Review";

export const DEFAULT_FNF_SECTIONS: PitchFeedbackSection[] = [
  {
    key: "why",
    eyebrow: "01 · Why this exists",
    title: "A private read on whether the story lands",
    body:
      "I am using this review to pressure-test the pitch before it reaches colder audiences. The goal is not praise. The goal is to find what is clear, what feels weak, and where the next conversation should go.",
    proof:
      "The best feedback here is specific: a point that confused you, a claim that needs proof, or a person you think should see this next.",
    prompts: [
      {
        key: "first-reaction",
        label: "Initial reaction",
        type: "reaction",
      },
    ],
  },
  {
    key: "problem",
    eyebrow: "02 · Problem",
    title: "Warm relationships become scattered signals",
    body:
      "Founder feedback often arrives through messages, calls, half-read decks, and quick comments. The signal is valuable, but it disappears unless every reaction connects back to the person, context, and follow-up path.",
    proof:
      "AGB CRM already treats contacts, projects, touches, and AI summaries as one relationship graph. This module extends that graph to private pitch review.",
    prompts: [
      {
        key: "problem-clarity",
        label: "How clear is this problem?",
        type: "score",
      },
      {
        key: "problem-gap",
        label: "What feels missing or overstated?",
        type: "objection",
      },
    ],
  },
  {
    key: "solution",
    eyebrow: "03 · Solution",
    title: "A contact-linked pitch walkthrough",
    body:
      "Each contact gets a private link to a silent guided walkthrough. They react as they go. AGB CRM tracks the invite, progress, responses, sentiment, objections, and follow-up from the contact record.",
    proof:
      "The experience is intentionally not a survey or a generic deck host. The public link captures feedback; the CRM owns the relationship intelligence.",
    prompts: [
      {
        key: "solution-reaction",
        label: "Does this feel useful?",
        type: "reaction",
      },
      {
        key: "solution-note",
        label: "What would make this more useful?",
        type: "text",
      },
    ],
  },
  {
    key: "ai",
    eyebrow: "04 · AI leverage",
    title: "AI turns raw comments into next actions",
    body:
      "AI can personalize the invite, summarize feedback, detect objections, classify support level, cluster campaign-wide confusion, and draft a human-approved follow-up.",
    proof:
      "AI does not send autonomously. It prepares the insight and draft; the Founder decides what to do with the relationship.",
    prompts: [
      {
        key: "ai-confidence",
        label: "How confident are you in this AI use case?",
        type: "score",
      },
      {
        key: "ai-risk",
        label: "What should AI not do here?",
        type: "text",
      },
    ],
  },
  {
    key: "tracking",
    eyebrow: "05 · Tracking",
    title: "The contact record stays the source of truth",
    body:
      "The CRM should answer who received the link, who opened it, who got stuck, who completed it, what they said, what AI concluded, and what follow-up should happen.",
    proof:
      "Granular section events stay in analytics. Only meaningful milestones become contact timeline touches.",
    prompts: [
      {
        key: "tracking-trust",
        label: "Does this level of tracking feel reasonable?",
        type: "reaction",
      },
      {
        key: "tracking-boundary",
        label: "Where would tracking feel excessive?",
        type: "text",
      },
    ],
  },
  {
    key: "ask",
    eyebrow: "06 · Final ask",
    title: "What should happen next?",
    body:
      "Your feedback should help decide what to clarify, who to speak with next, and whether this is ready for a broader audience.",
    proof:
      "The most useful next step can be a call, an intro, a sharper objection, or permission to send a revised version.",
    prompts: [
      {
        key: "final-confidence",
        label: "Overall confidence",
        type: "score",
        required: true,
      },
      {
        key: "final-feedback",
        label: "Most important feedback",
        type: "final",
        required: true,
      },
      {
        key: "next-intro",
        label: "Who else should see this?",
        type: "intro",
      },
    ],
  },
];
