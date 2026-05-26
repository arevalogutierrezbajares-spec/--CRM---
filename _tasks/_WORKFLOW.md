# AGB CRM — Overlord Workflow

Lightweight task-board pattern adapted from `--TOURISM--` Operation Overlord, scaled down for a 2-Founder team.

## TL;DR

1. **Check the board** → [`_BOARD.md`](./_BOARD.md)
2. **Claim a task** by editing its file (status `open` → `claimed: <your-id>`)
3. **Work on a branch** named `task/AGB-NNN-short-slug`
4. **Open a PR** when done, link the task file
5. **After merge**, update task status to `merged` + commit message references AGB-NNN

## Why Overlord (vs just GitHub Issues)?

- Task files live in the repo, version-controlled with the code that implements them
- Each task has all context inline (FRs covered, ACs, files to touch, suggested approach)
- AI agents (Claude, Codex, etc.) can claim tasks autonomously without API quotas
- Status visible from any branch via filesystem
- No external service dependency

## Roles & IDs

| Role | ID Convention | Use |
|------|---------------|-----|
| Founder 1 (Tomas) | `tomas` | Claim, work, review |
| Founder 2 (cofounder) | `cofounder` (replace with name when known) | Claim, work, review |
| AI agent (Claude) | `claude-NNN` (auto-incremented) | Autonomous work via Claude Code |
| AI agent (Codex) | `codex-NNN` | Autonomous work via Codex CLI |
| AI agent (other) | `<tool>-NNN` | Hermes, Cursor, etc. |

## Task Lifecycle

```
open → claimed → in_progress → review → merged
                       ↓
                   blocked → (resolve) → in_progress
```

| Status | Meaning | Who sets |
|--------|---------|----------|
| `open` | Nobody is working on it; available to claim | created-by |
| `claimed` | An owner has been assigned but hasn't started | claimer |
| `in_progress` | Active work happening on a branch | claimer |
| `review` | PR open, awaiting review | claimer (auto-flagged on PR open) |
| `blocked` | Cannot proceed without external resolution; `blocker_note` required | claimer |
| `merged` | PR merged to main; task complete | reviewer (post-merge) |
| `parked` | Deferred indefinitely; can re-open later | any Founder |

## Task File Format

Every task lives in `_tasks/TASK-AGB-NNN-slug.md` with this frontmatter:

```yaml
---
id: TASK-AGB-NNN
title: Short imperative title
status: open | claimed | in_progress | review | blocked | merged | parked
priority: P0 | P1 | P2
phase: 0-7   # build phase from HLR-V2 §8
fr_covered: [FR-CON-1, FR-CON-2, ...]   # from FR-MATRIX.md
owner: null | <id>
branch: null | task/AGB-NNN-slug
pr: null | <PR URL>
estimated_points: 1 | 2 | 3 | 5 | 8 | 13
created: 2026-05-26
updated: 2026-05-26
blocker_note: null
---
```

Body sections (required):
- `## What` — one-paragraph plain-English description
- `## Why` — link to FRs and the user need
- `## Acceptance Criteria` — copied from FR-MATRIX.md (do not paraphrase)
- `## Files to touch` — suggested file paths
- `## Suggested approach` — implementation sketch (2-4 bullets)
- `## Out of scope` — explicit non-goals
- `## Notes` — anything else

## Claiming a Task

```bash
# 1. Pick a task from _BOARD.md (status: open, priority: P0 or P1)
# 2. Edit its file: change status to "claimed" and set owner
# 3. Commit + push the claim before starting work:

git add _tasks/TASK-AGB-XXX-*.md
git commit -m "chore(tasks): claim AGB-XXX (<your-id>)"
git push

# 4. Create a branch:
git checkout -b task/AGB-XXX-short-slug

# 5. Update status to "in_progress" and commit
```

This prevents two people from claiming the same task simultaneously — the push fails if someone else already claimed it.

## Doing the Work

- Read the linked FRs in `docs/requirements/FR-MATRIX.md` carefully — the ACs are authoritative
- Implement the AC by AC
- Write the test that maps to each AC (use `__tests__/AGB-XXX.test.ts` naming convention)
- When the test passes for an AC, check it off in the task file

## Opening a PR

PR title format: `feat(AGB-XXX): short title`
PR body must include:
- Link to task file: `Closes [AGB-XXX](_tasks/TASK-AGB-XXX-slug.md)`
- AC checklist with [x] for each acceptance criterion met
- Screenshot/CLI output if UI/CLI changes

On PR open, update task `status: review` and set `pr: <URL>`.

## Reviewing a PR

- The OTHER Founder reviews when possible (Tomas reviews cofounder's PRs and vice versa)
- AI agents may also self-review via Codex or `/review` skill
- All ACs in the FR must be verifiable from the PR diff
- If something's missing, comment on the PR and update task `status: in_progress` + `blocker_note`

## Merging

- Squash-merge (single commit per task on main)
- Commit message: `feat(AGB-XXX): <title> [FR-XXX-1, FR-XXX-2]`
- After merge, post-commit hook auto-updates task status to `merged`
- If no hook, the merger updates `_tasks/TASK-AGB-XXX-*.md` status manually

## Handoffs

When you stop work mid-task (end of day, switching to other work):

1. Push your branch (`git push origin task/AGB-XXX-slug`)
2. Update the task file:
   - `status: in_progress` (still claimed by you)
   - Add a `## Handoff Note` section at the bottom: what's done, what's next, any gotchas
3. Optionally, change `owner` to `null` to release the claim (anyone can pick up)

## AI Agent Etiquette

When dispatching an agent (Claude / Codex / Hermes) to work a task:

- Give it the task file path and FR-MATRIX.md path in the prompt
- Instruct it to claim the task by editing the file BEFORE writing code
- Instruct it to push the claim commit before starting implementation
- Instruct it to follow the AC checklist exactly
- Instruct it to never push to main directly — always PR

## Cross-Task Dependencies

If TASK-A blocks TASK-B, the TASK-B file's frontmatter must list `blocked_by: [TASK-AGB-A]`. The board will hide TASK-B from "available now" until TASK-A is merged.

## Estimated Points

Fibonacci-ish, 1-13:
- **1** — Trivial (under 30 min)
- **2** — Small focused change (1-2 hours)
- **3** — Standard task (half day)
- **5** — Notable feature (full day)
- **8** — Substantial (1-2 days)
- **13** — Large (split into smaller tasks if possible)

## File Locations

| File | Purpose |
|------|---------|
| `_tasks/_BOARD.md` | Master list, one row per task |
| `_tasks/_WORKFLOW.md` | This file |
| `_tasks/TASK-AGB-NNN-*.md` | Individual task spec |
| `docs/requirements/FR-MATRIX.md` | Source of truth for ACs |
| `docs/adr/ADR-NNN-*.md` | Architecture/decision records |
| `HANDOFF.md` | Top-level "where we are, what's next" |
