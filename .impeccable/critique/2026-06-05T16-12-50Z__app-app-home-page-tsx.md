---
target: CRM mobile Home, Meetings, meeting notes, Town Hall, Record Call
total_score: 26
p0_count: 0
p1_count: 2
timestamp: 2026-06-05T16-12-50Z
slug: app-app-home-page-tsx
---
**Design Health Score**

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Home briefing, autosave, live labels are visible, but capture flows do not share one status model. |
| 2 | Match System / Real World | 3 | CRM language is clear, but meeting capture is split across Meetings, Town Hall, Live Meeting, and Record Call. |
| 3 | User Control and Freedom | 3 | Back, cancel, close, and drawer controls exist, but several close/action targets are too small on phone. |
| 4 | Consistency and Standards | 2 | Home shell is strong; meeting and voice controls use smaller shared defaults. |
| 5 | Error Prevention | 2 | Good consent note on Record Call, but meeting form exposes too many fields before the core capture task. |
| 6 | Recognition Rather Than Recall | 3 | Navigation is clear and the Home widgets are scannable. Users still need to remember which capture route to use. |
| 7 | Flexibility and Efficiency | 3 | Town Hall, Home widgets, and mobile drawer are efficient. Meeting notes need a faster phone path. |
| 8 | Aesthetic and Minimalist Design | 3 | Dense, restrained product UI. Empty states can feel static when there is no data. |
| 9 | Error Recovery | 2 | Save errors exist, but mobile recovery patterns are limited. |
| 10 | Help and Documentation | 2 | Explanatory copy exists, but not as task-oriented mobile guidance. |
| **Total** | | **26/40** | **Solid product UI, not elite mobile yet.** |

**Anti-Patterns Verdict**

The CRM does not look like generic AI slop. It avoids gradient text, decorative glass, hero-metric templates, and pointless animation. The strongest visual signal is a restrained, dense operator dashboard.

Static detector result: `npx --yes impeccable detect --json --fast app/(app)/(home)/page.tsx components/dashboard app/(app)/meetings components/meetings components/town-hall/extract-notes-dialog.tsx` returned `[]`. The `--fast` flag is now deprecated and ignored by the CLI.

Product caveat: `PRODUCT.md` and `DESIGN.md` are missing, so this critique uses repository behavior plus product-register rules rather than a formal brand/design source of truth.

**Overall Impression**

Home is now substantially better on phone. It has no body overflow at iPhone width, the drawer is full-height with 40px rows, and the first screen gives users meetings, due tasks, briefing, Town Hall, action items, and tasks quickly.

The mobile weakness is the capture system. Meeting notes, notes extraction, live meeting recording, and Record Call are all valuable, but they do not yet feel like one intuitive phone-native workflow.

**Evidence**

- `/` at 393x852: body overflow 0. Only undersized visible target was the hidden skip link. Home first screen showed KRI strip, briefing, Customize, Town Hall, Action Items, Tasks.
- Mobile nav drawer at 393x852: 252px wide, 852px tall, body overflow 0, no drawer links under 40px.
- `/meetings` at 393x852: body overflow 0. Empty state works, but both `New meeting` CTAs measured 28px high.
- `/meetings/new` at 393x852 and 360x740: body overflow 0, but core form controls and sticky actions measured 32px high. Inputs, selects, Cancel, and Create meeting are below mobile target.
- `/town-hall` at 393x852: body overflow 0. `Notes -> action items` measured 28px high.
- Open notes extraction dialog: visible dialog is full-width centered, about 393x402. `Extract` measured 28px high and close icon measured 14px.
- `/record` at 393x852: body overflow 0. `Start recording`, language select, and contact input measured 32px high.

**What's Working**

1. Home density is finally in the right direction. The dashboard uses phone width well and avoids the old blank-space problem.
2. Navigation is good. The mobile drawer is readable, full-height, and physically tappable.
3. The product concept is strong. Town Hall plus action items plus meeting notes is the right operating system for a founder CRM.

**Priority Issues**

**[P1] Shared form/button sizing is too small for mobile capture.**
Why it matters: meeting notes and call recording are high-frequency phone tasks. 28-32px targets feel fiddly on iPhone and Android, especially while moving or switching context.
Fix: create mobile-safe defaults or a `touch` size variant for `Button`, `Input`, `SelectTrigger`, and high-value capture controls. Use 44px for forms and primary actions on mobile, while preserving dense desktop tables.
Suggested command: `$impeccable adapt`

**[P1] Meeting capture is fragmented across too many mental models.**
Why it matters: users should not have to decide between Meetings, Live Meeting, Town Hall notes extraction, and Record Call when the intent is simply "capture what happened and create tasks."
Fix: define one capture funnel: Capture -> Review -> Assign -> File. Expose it from Home and Town Hall, then route to meeting, call, or pasted-notes internals after the user chooses the source.
Suggested command: `$impeccable shape`

**[P2] Notes extraction dialog should be a mobile sheet.**
Why it matters: long pasted notes plus phone keyboard plus centered modal is not comfortable. The close and extract actions are undersized.
Fix: make `ExtractNotesDialog` use a bottom sheet or full-height mobile dialog with a sticky footer, 44px Extract/Back/Create actions, and large include toggles in review mode.
Suggested command: `$impeccable polish`

**[P2] Meeting create form is too front-loaded.**
Why it matters: on phone, a meeting note often starts with a title and raw notes, not full scheduling metadata.
Fix: make the first mobile view: Title, Notes/Minutes, Attendees, Save. Move Ended, met-at tag, linked project, type, and location behind "Details" or a secondary section.
Suggested command: `$impeccable distill`

**[P2] Empty states are clear but not dynamic.**
Why it matters: with no data, Home and Meetings feel calm but not active. The user asked for dynamic and intuitive, so empty states should teach the next useful action.
Fix: on empty Home/Meetings, show 2-3 action chips: Record call, Paste notes, Create meeting. These should be real 44px controls.
Suggested command: `$impeccable onboard`

**Cognitive Load**

Failure count: 3, moderate.

The Home screen is acceptable because complexity is chunked into widgets. The meeting form is the heavier cognitive-load point: it asks for title, schedule, end time, type, location, met-at tag, linked project, agenda, minutes, attendees, then save. That is too much for quick mobile capture.

**Persona Red Flags**

Founder on phone between calls: can navigate Home quickly, but Start Recording and Create Meeting controls are too small. The path from "I just had a call" to "tasks are filed" is not obvious enough.

Operator filing notes after a meeting: sees Meetings, Town Hall extraction, and Record Call as separate surfaces. The product should make these feel like modes of the same capture workflow.

First-time teammate: empty Home and Meetings are understandable, but they do not guide the user into the fastest successful first action.

**Recommended Next Pass**

Implement a mobile capture pass:

1. Add mobile-safe 44px sizing for capture forms and primary actions.
2. Convert notes extraction to a phone sheet with sticky actions.
3. Reframe Meetings mobile create flow around notes first, metadata second.
4. Add Home empty-state action chips for Record call, Paste notes, Create meeting.
5. Re-test `/`, `/meetings`, `/meetings/new`, `/town-hall`, notes dialog, `/record`, and mobile nav at 360px and 393px.
