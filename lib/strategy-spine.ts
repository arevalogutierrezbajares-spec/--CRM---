import { Eye, Flag, ListTodo, Map, Rocket, Target } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type StrategySpineStepId =
  | "mission"
  | "priorities"
  | "roadmap"
  | "sprint"
  | "tasks"
  | "review";

export type StrategySpineStep = {
  id: StrategySpineStepId;
  label: string;
  href: string;
  icon: LucideIcon;
  intent: string;
};

export const STRATEGY_SPINE_STEPS: StrategySpineStep[] = [
  {
    id: "mission",
    label: "Mission / Vision",
    href: "/workspace",
    icon: Eye,
    intent: "Create impact in Venezuela and win.",
  },
  {
    id: "priorities",
    label: "Priorities",
    href: "/priorities",
    icon: Target,
    intent: "Quarterly outcomes and measurable key results.",
  },
  {
    id: "roadmap",
    label: "Roadmap",
    href: "/roadmap",
    icon: Map,
    intent: "Initiatives that turn priorities into campaigns.",
  },
  {
    id: "sprint",
    label: "Sprint",
    href: "/sprint",
    icon: Flag,
    intent: "Current execution window and focus.",
  },
  {
    id: "tasks",
    label: "Tasks",
    href: "/work",
    icon: ListTodo,
    intent: "Owned work, blockers, and next actions.",
  },
  {
    id: "review",
    label: "Review",
    href: "/review",
    icon: Rocket,
    intent: "Truth cadence, scorecard, and adjustment.",
  },
];
