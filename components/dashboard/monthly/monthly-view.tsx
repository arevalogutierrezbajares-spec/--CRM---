import { MonthCalendar } from "./month-calendar";
import { MonthStats } from "./month-stats";
import { RiskFlags } from "./risk-flags";
import { TopAccounts, type TopAccountRow } from "./top-accounts";
import { ProjectsCard } from "../daily/projects-card";
import type {
  DashMeeting,
  DashProject,
} from "@/db/queries/dashboard";
import type { BlockedProject, DueItem } from "@/db/queries/this-week";

interface MonthlyViewProps {
  monthStart: Date;
  meetings: DashMeeting[];
  projects: DashProject[];
  overdueTasks: DueItem[];
  blocked: BlockedProject[];
  topAccounts: TopAccountRow[];
  monthStats: {
    meetingsHeld: number;
    tasksCompleted: number;
    tasksTotal: number;
    projectsActive: number;
    contactsTouched: number;
  };
}

export function MonthlyView({
  monthStart,
  meetings,
  projects,
  overdueTasks,
  blocked,
  topAccounts,
  monthStats,
}: MonthlyViewProps) {
  return (
    <>
      <div className="grid gap-2.5 lg:grid-cols-[1fr_320px]">
        <MonthCalendar meetings={meetings} monthStart={monthStart} />
        <MonthStats {...monthStats} />
      </div>
      <div className="grid gap-2.5 lg:grid-cols-2">
        <RiskFlags blocked={blocked} overdueTasks={overdueTasks} />
        <TopAccounts rows={topAccounts} />
      </div>
      <ProjectsCard projects={projects} />
    </>
  );
}
