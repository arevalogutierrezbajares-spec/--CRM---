# Strategy Spine

The operating model should read top to bottom:

1. Mission / Vision: create impact in Venezuela and win.
2. Priorities: 3-7 quarterly objectives with measurable key results.
3. Roadmap: initiatives that turn objectives into campaigns.
4. Sprint: the current execution window.
5. Tasks: owned work, blockers, materials, and next actions.
6. Review: truth cadence, scorecard, and adjustment.

## What Already Links

- `objectives` and `key_results` power `/priorities`, Home KPIs, and Weekly Review.
- `initiatives` power `/roadmap`.
- `sprints` can attach to one `initiative_id`.
- `milestones` can attach to one `initiative_id` and one `sprint_id`.
- Projects can hold high-level objectives in `projects.objectives`, but that is separate from OKRs.

## Missing Link

The product gap is a first-class link from quarterly objectives to roadmap initiatives.

Recommended next migration:

```sql
create table objective_initiatives (
  objective_id uuid not null references objectives(id) on delete cascade,
  initiative_id uuid not null references initiatives(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  contribution_note text,
  created_at timestamptz not null default now(),
  primary key (objective_id, initiative_id)
);
```

That lets the UI answer:

- Which initiatives serve this objective?
- Which objectives justify this roadmap item?
- Which sprint is advancing which objective?
- Which tasks are disconnected from strategy?

## UX Recommendation

Add an "Aligned roadmap" block inside each objective card, with an attach initiative picker.
Add objective chips to roadmap initiatives and sprint headers.
Add a weekly review check: "work not linked to an objective."
