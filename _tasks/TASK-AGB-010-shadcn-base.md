---
id: TASK-AGB-010
title: Install shadcn/ui base components + theme
status: review
priority: P0
phase: 1
fr_covered: []
owner: OVL-AGB-Claude
branch: null
pr: null
estimated_points: 2
created: 2026-05-26
updated: 2026-05-26
blocked_by: []
blocker_note: null
---

## What

Initialize shadcn/ui in the project and install the base components needed for Phase 1 forms and layouts: Button, Input, Label, Select, Textarea, Card, Badge, Avatar, Dropdown Menu, Sheet (drawer), Dialog, Toast (sonner), Form (react-hook-form integration).

## Why

Prerequisite for every Phase 1 UI task. Lifts the component library proven in CaneyCloud PMS frontend.

## Acceptance Criteria

- [ ] `pnpm dlx shadcn@latest init` completes with defaults: `app/globals.css` styling, `components/ui/` location, base color = neutral, CSS variables = yes
- [ ] Following components installed: `button`, `input`, `label`, `select`, `textarea`, `card`, `badge`, `avatar`, `dropdown-menu`, `sheet`, `dialog`, `sonner`, `form` (`pnpm dlx shadcn@latest add <name>` per)
- [ ] `lib/utils.ts` (cn helper) exists
- [ ] `tailwind.config.ts` includes shadcn theme tokens
- [ ] Sample `<Button variant="default">Hello</Button>` renders correctly on a scratch page (delete after verifying)
- [ ] `pnpm build` and `pnpm exec tsc --noEmit` both pass
- [ ] Existing `/login` page styled with shadcn Button + Input (replacing the manual classes)

## Files to touch

```
components/ui/*           # auto-created by shadcn add
lib/utils.ts              # auto-created
tailwind.config.ts        # tweaked by shadcn init
app/globals.css           # tweaked by shadcn init
app/login/page.tsx        # replace hand-rolled classes with shadcn Button/Input
```

## Suggested approach

1. `pnpm dlx shadcn@latest init` — accept defaults (neutral color, CSS variables yes, React Server Components yes)
2. Run `pnpm dlx shadcn@latest add button input label select textarea card badge avatar dropdown-menu sheet dialog sonner form` in a single command
3. Replace `app/login/page.tsx` form elements with shadcn components (preserve the magic-link behavior — only swap the styling)
4. Build + typecheck + push

## Out of scope

- Adding shadcn Table, Calendar, Data Table — those come in Phase 2 grid tasks
- Designing dark mode — accept default light/dark toggle from shadcn
- Custom theme tokens (AGB brand colors) — Phase 6+ polish

## Notes

If shadcn init asks about React Server Components, say yes (we're using App Router). If it asks about Tailwind 4 specifically, accept whatever it defaults to — Tailwind 4 is already configured.
