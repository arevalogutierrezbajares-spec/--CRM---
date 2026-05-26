/**
 * Health color heuristic — used by grid badges, This-Week, and Kanban.
 *
 * Inputs are intentionally minimal so this is fast to compute in bulk.
 *
 * Rules (priority order):
 *   - status=done                            → green (terminal happy)
 *   - status=lost                            → red
 *   - status=waiting with expected_unblock in the past   → red
 *   - status=waiting (with date in the future or no date)→ amber
 *   - any milestone overdue (due_date < today, status != done) → red
 *   - any milestone due in next 3 days (status != done)        → amber
 *   - else                                                     → green
 */

export type HealthColor = "green" | "amber" | "red";

export type HealthInput = {
  status: "active" | "waiting" | "done" | "lost";
  expectedUnblockDate?: string | null; // YYYY-MM-DD
  milestones?: Array<{
    status: "pending" | "done" | "blocked";
    dueDate: string | null;
  }>;
  now?: Date;
};

export function computeHealth(input: HealthInput): HealthColor {
  if (input.status === "done") return "green";
  if (input.status === "lost") return "red";

  const today = (input.now ?? new Date()).toISOString().slice(0, 10);

  if (input.status === "waiting") {
    if (
      input.expectedUnblockDate &&
      input.expectedUnblockDate < today
    ) {
      return "red";
    }
    return "amber";
  }

  const milestones = input.milestones ?? [];
  let hasOverdue = false;
  let hasUpcoming = false;
  for (const m of milestones) {
    if (m.status === "done" || !m.dueDate) continue;
    if (m.dueDate < today) {
      hasOverdue = true;
      break;
    }
    const daysOut = Math.floor(
      (new Date(m.dueDate).getTime() - new Date(today).getTime()) / 86400000,
    );
    if (daysOut >= 0 && daysOut <= 3) hasUpcoming = true;
  }
  if (hasOverdue) return "red";
  if (hasUpcoming) return "amber";
  return "green";
}
