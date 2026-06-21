I have read the entire file (all 605 lines). Here is the complete design extraction.

---

# DESIGN EXTRACTION — "The Brain" Architecture Canvas

Source: `finalized.html` (605 lines). Dark mode, single-file. Fonts: Space Grotesk, IBM Plex Mono, Inter (Google Fonts). `<html data-lens="navigation" data-preset="investor">`.

---

## 1. COLOR TOKENS (verbatim `:root`)

```css
:root{
  --bg:#08090c; --bg-2:#0d0f15; --panel:#0f1217; --panel-2:#14171e; --panel-s:#171b24;
  --line:rgba(255,255,255,0.07); --line-2:rgba(255,255,255,0.12);
  --ink:#f4f6fa; --ink-dim:#9aa4ba; --ink-faint:#646e85;
  --vav:#E3B061; --caney:#5BBCE6; --crm:#B189EE; --caneyrest:#F0915E; --academy:#4FC3A8; --ext:#7c89a3;
  --done:#58CE97; --doing:#E3B65E; --needed:#6c7892;
  --ok:#58CE97; --warn:#E3B65E; --dark:#6c7892;
  --shadow-color:222deg 47% 3%;
}
```

Semantic mapping:
- **Backgrounds:** page `--bg #08090c`; orb fill base `--bg-2 #0d0f15`; surfaces `--panel #0f1217`, `--panel-2 #14171e`, raised/selected chips `--panel-s #171b24`.
- **Lines/borders:** `--line rgba(255,255,255,0.07)`, `--line-2 rgba(255,255,255,0.12)`.
- **Text:** primary `--ink #f4f6fa`, dim `--ink-dim #9aa4ba`, faint `--ink-faint #646e85`.
- **Per-system accents:** VAV `#E3B061` (gold), CaneyCloud `#5BBCE6` (blue), AGB-CRM `#B189EE` (violet), Caney Restaurants `#F0915E` (orange), Caney Academy `#4FC3A8` (teal), externals `#7c89a3`.
- **Status (double-encoded — see §4):** done/built `--done #58CE97`, doing/WIP `--doing #E3B65E`, needed/roadmap `--needed #6c7892`.
- **Health (interchanges):** ok `--ok #58CE97`, warn `--warn #E3B65E`, dark `--dark #6c7892`.

**Function-overlay colors** (separate JS palette, NOT in `:root`, line 324):
```js
const FNCOLOR={growth:'#E8896B',sales:'#5ED6A6',ops:'#7E8CF0',cx:'#E87FB8',admin:'#4FC9C0',platform:'#94A3C7'};
```
Function-hub accent uses literal `#aebbd6` (set via `--accent` in `funcHub`).

**Hardcoded hex outside tokens:**
- Code block bg `#070b12`; code text `#b2bdd1`.
- Badge ok text `#bdf0d6`; badge warn text `#f0e3bd`; badge dark text `#c2cad8`.
- Primary button gradient `linear-gradient(180deg,#6fc8ec,var(--caney))`, text `#06121a`.
- Hub orb gradient top-left `rgba(255,255,255,.07)`.
- Body radial accents: `rgba(91,188,230,.05)` (caney) + `rgba(177,137,238,.05)` (crm).

---

## 2. GLASS / GLEAM / SHADOW RECIPES (verbatim)

**Layered shadow stacks + gleam + easings (`:root`):**
```css
--shadow-color:222deg 47% 3%;
--shadow-low:0 1px 1px hsl(var(--shadow-color)/.5),0 1px 2px -1px hsl(var(--shadow-color)/.5);
--shadow-med:0 1px 2px hsl(var(--shadow-color)/.4),0 3px 6px -2px hsl(var(--shadow-color)/.45),0 8px 16px -5px hsl(var(--shadow-color)/.5);
--shadow-high:0 2px 4px hsl(var(--shadow-color)/.4),0 10px 20px -5px hsl(var(--shadow-color)/.55),0 28px 46px -10px hsl(var(--shadow-color)/.62);
--gleam:inset 0 1px 0 rgba(255,255,255,.06);
--ease:cubic-bezier(.16,1,.3,1); --ease-back:cubic-bezier(.34,1.42,.64,1);
```
The "gleam" is a 1px inset top highlight applied to nearly every raised surface (top bar, chips, badges, buttons, minimap, panels, search, segments).

**Body background (two radial accent washes over base):**
```css
body{background:radial-gradient(1200px 820px at 80% -140px,rgba(91,188,230,.05),transparent 60%),radial-gradient(960px 720px at 6% 120%,rgba(177,137,238,.05),transparent 55%),var(--bg);}
```

**Backdrop-filter (glass) usages — exact values:**
- Top bar: `background:rgba(13,15,21,.55);backdrop-filter:blur(20px) saturate(180%);` + `box-shadow:var(--gleam)`.
- Search results dropdown: `background:rgba(13,15,21,.92);backdrop-filter:blur(20px) saturate(180%);` `box-shadow:var(--shadow-high)`.
- Altitude pill: `background:rgba(13,15,21,.55);backdrop-filter:blur(16px) saturate(160%);` `box-shadow:var(--shadow-low),var(--gleam)`.
- Back button: `background:rgba(13,15,21,.55);backdrop-filter:blur(16px);`.
- Thread label: `background:rgba(13,15,21,.85);backdrop-filter:blur(8px);`.
- Minimap: `background:rgba(13,15,21,.6);backdrop-filter:blur(16px) saturate(160%);` `box-shadow:var(--shadow-med),var(--gleam)`.
- Detail panel: `background:rgba(15,18,23,.72);backdrop-filter:blur(22px) saturate(180%);` `box-shadow:var(--gleam)`.
- Command palette backdrop: `background:rgba(4,5,8,.5);backdrop-filter:blur(4px);`.
- Command palette card: `background:rgba(15,18,23,.9);backdrop-filter:blur(28px) saturate(180%);` `box-shadow:var(--shadow-high),var(--gleam)`.
- All include `-webkit-backdrop-filter` duplicates.

**Focus ring (verbatim):**
```css
:focus-visible{outline:2px solid transparent;outline-offset:2px;box-shadow:0 0 0 2px var(--bg),0 0 0 4px var(--caney);border-radius:9px}
```

**Hub orb (the signature "gleam" sphere) — verbatim:**
```css
.hub .orb{width:104px;height:104px;border-radius:50%;display:grid;place-items:center;position:relative;
  background:radial-gradient(circle at 38% 30%,rgba(255,255,255,.07),var(--bg-2) 64%);
  border:1px solid var(--line-2);box-shadow:var(--shadow-med),var(--gleam)}
```
Progress ring (conic, masked donut):
```css
.hub .orb::before{content:"";position:absolute;inset:-1px;border-radius:50%;
  background:conic-gradient(var(--accent) calc(var(--p)*1%),rgba(255,255,255,.10) 0);
  -webkit-mask:radial-gradient(circle,transparent 48px,#000 49px);mask:radial-gradient(circle,transparent 48px,#000 49px)}
.hub.center .orb{width:120px;height:120px}
.hub.center .orb::before{-webkit-mask:radial-gradient(circle,transparent 56px,#000 57px);mask:radial-gradient(circle,transparent 56px,#000 57px)}
```
`--p` = percent built (0–100); `--accent` = system color. The mask carves a transparent inner disc so only the ring shows.

**Brand logo dot (conic):** `background:conic-gradient(from 200deg,var(--vav),var(--caney),var(--crm),var(--vav))`.

**Primary button (gradient + inner highlight):**
```css
.btn.primary{background:linear-gradient(180deg,#6fc8ec,var(--caney));border-color:transparent;color:#06121a;font-weight:600;box-shadow:var(--shadow-med),inset 0 1px 0 rgba(255,255,255,.25)}
```

---

## 3. TYPOGRAPHY

Google Fonts link (line 9): `Space Grotesk:wght@400;500;600;700` · `IBM Plex Mono:wght@400;500;600` · `Inter:wght@400;500`.

```css
--mono:'IBM Plex Mono',ui-monospace,monospace;
--disp:'Space Grotesk',system-ui,sans-serif;
--body:'Inter',system-ui,sans-serif;
```
Body base: `font-family:var(--body);-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;font-optical-sizing:auto;text-rendering:optimizeLegibility;letter-spacing:-0.006em`.

Key type treatments (font / size / weight / letter-spacing):
- Brand `b`: disp 700, 14px, `letter-spacing:.07em`.
- Hub pct: disp 700, 21px, `letter-spacing:-.02em`, `font-variant-numeric:tabular-nums`. Center pct 20px; function-hub pct 18px (center 20px), `<small>` 10px.
- Hub name: disp 600, 15px, `letter-spacing:-.01em`. Function name 12.5px.
- Detail title `.d-title`: disp 600, 17px, `letter-spacing:-.011em`.
- **Mono label treatment** (the recurring "data readout / chip" style): IBM Plex Mono, small (8–12px), often `text-transform:uppercase` with wide `letter-spacing` — e.g. rail `h4`: 10px, `letter-spacing:.16em`, uppercase, color `--ink-faint`. Section `h5`: 10px, `.13em`, uppercase. Altitude: 10px, `.2em`, uppercase. `.d-kind`: 9.5px, `.15em`, uppercase.
- Chip title `.chip .t`: mono 11px, `--ink`. `.more`: mono 8.5px, uppercase, `.04em`, `--ink-faint`.
- Body copy `.d-sec p`: 12.5px, `line-height:1.55`, `--ink-dim`.
- `.kv` rows: mono 11px, `font-variant-numeric:tabular-nums`; `b` = `--ink` weight 500.
- Buttons `.btn`: mono 11px, `.03em`, uppercase.
- `kbd`: mono 10px, bordered.
- Cmdk input: body 15px; cmdk items 13px; group headers `.gh`: mono 9px, `.14em`, uppercase.

---

## 4. NODE CARD ANATOMY

**System / Function node = HUB** (`.ent.hub`, built by `hubEl`/`funcHub`):
- Wrapper `button.ent.hub` (`.center` variant when focused). `position:absolute;transform:translate(-50%,-50%)`, flex-column, `gap:7px`. Spawn animation. `--accent` and `--p` set inline.
- DOM: `<div class="orb" style="--p:78"><span class="pct">78<small>%</small></span></div><span class="name">VAV</span>`.
- The orb = gleam sphere + conic progress ring (§2). Function hub adds a row of tiny system dots (7px circles colored per contributing system) under the name.

**Domain node = CHIP** (`.ent.nd`, built by `domEl`/`memberEl`):
- DOM: `<div class="chip"><span class="si">✓</span><span class="t">Bookings</span></div><span class="more">4 surfaces ▸</span>`.
- Chip CSS:
```css
.nd .chip{display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:10px;background:var(--panel-s);border:1px solid var(--line-2);box-shadow:var(--shadow-low),var(--gleam);transition:transform .28s var(--ease-back),border-color .2s var(--ease),box-shadow .2s var(--ease);position:relative}
.nd:hover .chip{transform:translateY(-3px);border-color:var(--accent);box-shadow:var(--shadow-med),var(--gleam)}
```
- `.si` = status icon glyph, mono 11px, weight 600, 13px wide.
- `.more` = secondary readout under chip (surface count / `NEEDED` / `BUILT`/`WIP`). In function lens, `.more` is tinted to the system color.

**DOUBLE-ENCODING of status (color + shape/icon/text + border treatment) — verbatim:**
```css
.nd[data-state="done"]   .si{color:var(--done)}   .nd[data-state="done"]   .chip{border-left:3px solid var(--done)}
.nd[data-state="doing"]  .si{color:var(--doing)}  .nd[data-state="doing"]  .chip{border-left:3px solid var(--doing)}
.nd[data-state="needed"] .si{color:var(--needed)} .nd[data-state="needed"] .chip{border-left:3px dashed var(--needed);opacity:.72}
```
- Icon glyphs (JS, line 248): `SI={done:'✓',doing:'◐',needed:'○'}`; text labels `SLBL={done:'BUILT',doing:'WIP',needed:'NEEDED'}`.
- So each state is encoded **three ways**: color, glyph shape (✓ filled-check / ◐ half / ○ hollow), AND a solid-vs-dashed left border + opacity. Needed nodes are also dimmed and dashed.

**Sizes:** `data-size` = `sm|md|lg` (`sizeFor`: ≥3 surfaces=lg, 0=sm, else md). `lg` chip `padding:10px 15px`, `.t` 12px; `sm` chip `padding:6px 10px`.

**Cluster node** (collapsed roadmap group): `.nd.cluster .chip{background:repeating-linear-gradient(45deg,rgba(124,137,163,.10) 0 7px,transparent 7px 14px);border:1px dashed var(--line-2)}` — hatched, dashed.

**Cross-link badge** (`data-xlink="1"`) — a ⇄ token pinned top-right:
```css
.nd[data-xlink="1"] .chip::after{content:"⇄";position:absolute;right:-7px;top:-7px;font-size:9px;color:var(--warn);background:var(--bg);border:1px solid var(--line-2);border-radius:50%;width:15px;height:15px;display:grid;place-items:center}
```

**Selected state:** `.ent.sel .chip,.ent.sel .orb{border-color:var(--accent);box-shadow:inset 0 0 0 1px var(--accent),var(--shadow-med)}`.

---

## 5. PANELS & CHROME

**App grid:**
```css
.app{display:grid;grid-template-rows:54px 1fr;grid-template-columns:204px 1fr 326px;grid-template-areas:"top top top" "rail canvas detail";height:100vh}
```
Top bar 54px; left rail 204px; right detail 326px.

**Top bar (`.top`):** flex, gap 16px, padding `0 18px`, bottom border `--line`, `z-index:30`, glass (§2). Contains: `.brand` (conic dot 20px + "THE BRAIN"), `.crumbs` breadcrumb, `.searchwrap` (340px, pushed right via `margin-left:auto`), `.presets` audience switcher (Investor/Agent/Operator segmented control).

**Breadcrumb (`.crumbs`):** mono 12px, buttons `--ink-faint` → hover `--ink-dim`, current `.cur` = `--ink`, `.sep` = `›` at 0.5 opacity. Built dynamically (Portfolio › System › Domain, or Functions › Func › Domain).

**Search:** `.search` pill — `background:rgba(255,255,255,.04);border:1px solid var(--line-2);border-radius:10px;padding:7px 11px`, mono 12px, gleam. Focus-within → `border-color:rgba(91,188,230,.5);background:rgba(255,255,255,.06)`. `⌕` leading glyph, `⌘K` `kbd` trailing. `.results` dropdown (glass, rounded 11px, rows with icon + label + right-aligned `type · path`; `.empty` state: "No node matches … — safe to build it.").

**Presets / segmented controls (rail `.seg`, top `.presets`):** pill container `background:rgba(255,255,255,.035);border:1px solid var(--line-2);border-radius:9-10px;padding:3px;gleam`; buttons mono uppercase, active `[aria-pressed="true"]{background:var(--panel-s);color:var(--ink)}`.

**Left rail (`.rail`):** right border `--line`, `padding:16px 13px`, scrollable, subtle top gradient `linear-gradient(180deg,rgba(255,255,255,.015),transparent 38%)`. Sections via `h4` mono-uppercase labels:
- **View** — axis toggle `.seg` "By System / By Function".
- **Lenses** — `.lens-group`: 5 buttons (Navigation 🗺️, Topology 🚇, Liveness 🧠, State 🌳, Function overlay 🗂️), each `.ic` + label + `.sub` (mono 9px sub-caption). Active `[aria-pressed="true"]{background:var(--panel-s);border-color:var(--line-2);color:var(--ink)}`.
- **Status** legend (`.legend .row`): ✓ built / ◐ WIP / ○ needed / ⇄ cross-system link, each a colored `.gi` glyph.
- **Systems** legend: `.swatch` 10×10 rounded-3 color chips per system.
- **Functions** legend injected when in function axis (`#fnLegend`).

**Legend swatches:** `.swatch{width:10px;height:10px;border-radius:3px}` ; line variant `.swatch.line{width:15px;height:3px;border-radius:2px}`.

**Canvas chrome:** `.altitude` centered top pill ("Portfolio · 3 systems · L0"); `.backbtn` top-left ("← zoom out esc", fades in past L0); `.externals` top-right chip cluster (Stripe, Anthropic, WhatsApp, Mapbox, SiteMinder, Inngest, Resend, PostHog, Sentry) — hidden when `data-level≠0`.

**Minimap (`.minimap`):** bottom-left, 128×90px, glass, rounded 12px. `.t` "YOU ARE HERE" mono-uppercase label. `.map` 58px tall; `.m` nodes = 11×11 circles, `border:1.5px solid var(--accent)`, transparent; current `.here` filled with accent. Positions per system hardcoded (`renderMinimap` pos map).

**Detail panel (`.detail`, right, 326px):** glass, left border, scroll, flex-column. Section anatomy:
- `.d-head` — `.d-kind` (mono uppercase kind), `.d-title` (disp 600 17px + `.tdot` 9px color dot), `.d-route` (mono 11px, color `--caney`, breakable).
- `.d-badges` — pill badges. `.badge{font:mono 10px;padding:4px 9px;border-radius:7px;border:1px solid var(--line-2);gleam}`; variants `.ok` (text `#bdf0d6`, border `rgba(88,206,151,.45)`), `.warn` (`#f0e3bd`, border `rgba(227,182,94,.45)`), `.dark` (`#c2cad8`). `.gi` glyph tinted to status.
- `.d-sec` — repeatable section, bottom border; `h5` mono-uppercase header + `p` body / `.kv` key-values / `.mini` lists / `.xrow` cross-link rows.
- `.kv` — space-between mono rows, tabular-nums, `b` highlighted.
- `.mini .m` — clickable list rows (hover `background:var(--panel-s)`), status `.si` + `.ct` right-aligned count.
- `.xrow` — cross-system link row: `border:1px solid var(--line);background:rgba(255,255,255,.02)`, hover `border-color:var(--warn)`; `.g` health glyph, `.to`, `.pp` purpose.
- `.code` — code block: `background:#070b12;border:1px solid var(--line);border-radius:10px;color:#b2bdd1;white-space:pre`. Syntax spans `.k{color:var(--caney)} .s{color:var(--done)} .c{color:var(--ink-faint)}`.
- `.breaks` — warning callout: `background:rgba(227,182,94,.08);border:1px solid rgba(227,182,94,.28);border-radius:10px`; `.t` warn-colored mono-uppercase ("⚠ what breaks if this changes"); `code` inside tinted `--vav`.
- `.d-actions` — `margin-top:auto`, stacked `.btn`s. `.hint` footer (mono 10px faint).

**Command palette (`.cmdk`):** 560px (max 92vw), `max-height:64vh`, opens at `padding-top:13vh`, glass card rounded 14px. Input 15px body, bottom border. `.list` scroll; `.gh` group headers (Lenses / Audiences / Navigate / Jump to); `.it` rows with `.ic` + label + `.sp` shortcut hint (e.g. ⌘1–⌘5, esc); active row `background:var(--panel-s)`, active icon tinted `--caney`.

---

## 6. MOTION (every transition / keyframe — verbatim)

**Easings:** `--ease:cubic-bezier(.16,1,.3,1)` (expo-out, default), `--ease-back:cubic-bezier(.34,1.42,.64,1)` (overshoot spring, used on hover-lift, station/portal/ring/button press).

**Keyframes:**
```css
@keyframes sweep{to{transform:translateX(100%)}}           /* investor "reveal" diagonal light sweep */
@keyframes spawn{from{opacity:0;transform:translate(-50%,-50%) scale(.8)}to{opacity:1;transform:translate(-50%,-50%) scale(1)}}  /* node entrance */
@keyframes beat{0%,100%{transform:scale(1)}50%{transform:scale(1.12)}}  /* liveness station pulse */
```

**Reveal sweep** (fires on Investor preset): `.canvas.reveal::after{...background:linear-gradient(100deg,transparent 42%,rgba(91,188,230,.10) 50%,transparent 58%);transform:translateX(-100%);animation:sweep 1.1s var(--ease) forwards}`.

**Spawn:** `.ent,.station,.portal,.thread-lbl` use `animation:spawn .44s var(--ease) both`; staggered via inline `animation-delay` (`60+i*28ms`, `i*55ms`, `60+i*38ms`, etc.).

**Hover transitions:**
- `.nd .chip` transition `transform .28s var(--ease-back),border-color .2s var(--ease),box-shadow .2s var(--ease)`; hover `translateY(-3px)`.
- Hub orbs none; portal ring `transition:transform .26s var(--ease-back)`, hover `scale(1.08)`. Station pin `transition:transform .26s var(--ease-back)`, hover `scale(1.12)`. Search `border/background .2s var(--ease)`. Seg/preset/lens `background .2s/.18s var(--ease)`. Back button `opacity .25s`. Externals `opacity .35s`. Station label `opacity .2s`.
- `.btn` `transition:transform .2s var(--ease-back)...`; hover `translateY(-1px)`, active `translateY(0)`.

**Liveness pulse:** `html[data-lens="liveness"] .station[data-health="ok"] .pin{animation:beat 1.9s infinite}`.

**Zoom transition** (`.zoomwrap`): `transition:transform .22s var(--ease),opacity .18s var(--ease);will-change:transform,opacity`. JS `go()` choreography (lines 482–488): on drill-down vs up it scales the whole stage (`sc=out?1.6:0.7`), fades to opacity 0, sets `transform-origin` to the clicked node's `%` position, then after 200ms swaps content and animates from `scale(out?1.25:0.85)` back to `scale(1)` opacity 1 across two `requestAnimationFrame`s (the zoom-into/out-of effect).

**prefers-reduced-motion handling (verbatim, lines 180–184):**
```css
@media (prefers-reduced-motion: reduce){
  .ent,.station,.portal,.thread-lbl{animation:none}
  .zoomwrap{transition:none} .canvas.reveal::after{animation:none;display:none}
  html[data-lens="liveness"] .station .pin{animation:none} *{scroll-behavior:auto}
}
```
Also in JS: `const RM=matchMedia('(prefers-reduced-motion: reduce)').matches;` — `go()` skips the zoom choreography entirely when `RM` is true (`if(RM){st=ns;render();return;}`); reveal sweep skipped when RM.

---

## 7. LAYOUT — canvas background, edges, stations

**Canvas dot grid + grab cursor:**
```css
.canvas{position:relative;overflow:hidden;cursor:grab;background-image:radial-gradient(circle at 1px 1px,rgba(255,255,255,0.032) 1px,transparent 0);background-size:42px 42px}
.canvas:active{cursor:grabbing}
```
42px dot pitch, near-invisible white dots. Stage is `position:absolute;inset:0`. SVG `.spokes` sits at `z-index:1` behind nodes (`z-index:3`), `pointer-events:none`.

**Edges / links (SVG "spokes")** — drawn by `spoke()` (lines 339–343): quadratic Bézier with an upward control-point bow (`my=(y1+y2)/2-36`), `stroke-width:2`, `fill:none`, variable `stroke-opacity`, optional `stroke-dasharray`. Color & opacity by context:
- Hub→domain spoke: system color, opacity `.3` (needed `.16`, dashed `'4 6'`).
- Hub→surface: system color, opacity `.28`.
- L0 interchange spokes between systems: health color (`hcol`), opacity `.5`, dark health dashed `'7 7'`.
- Cross-system threads (L1) / portals (L2): health color, opacity `.5`, dark dashed `'6 6'`.
No SVG arrowmarkers — direction is conveyed by `→/←` glyphs in labels, not markerheads.

**Interchange "stations"** (the subway-station pins, L0 only, `.station`):
```css
.station .pin{width:22px;height:22px;border-radius:7px;display:grid;place-items:center;background:var(--bg-2);border:2px solid var(--warn);font:mono 11px/600 var(--warn);box-shadow:var(--shadow-med),var(--gleam);transition:transform .26s var(--ease-back)}
.station[data-health="ok"]   .pin{border-color:var(--ok);color:var(--ok)}
.station[data-health="dark"] .pin{border-color:var(--dark);color:var(--dark);border-style:dashed}
```
Health double-encoded: ok = solid green pin w/ ✓, warn = solid amber pin w/ !, dark = dashed gray pin w/ ·. Hover `scale(1.12)`. `.lbl` tooltip (mono 8.5px, dark glass pill) hidden until `:hover`/`.sel`. Stations hidden when `data-level≠0`.

**Portals (L2)** — dashed accent ring to another system: `.portal .ring{width:50px;height:50px;border-radius:50%;border:1.5px dashed var(--accent);background:radial-gradient(circle at 40% 32%,rgba(255,255,255,.05),transparent 70%);disp 700 15px;box-shadow:var(--shadow-med),var(--gleam)}` + `.cap` caption (mono 9px, dir glyph + bold system name + purpose).

**Thread labels (L1)** — `.thread-lbl{...background:rgba(13,15,21,.85);backdrop-filter:blur(8px);border:1px solid var(--line-2);border-radius:7px;mono 8.5px;box-shadow:var(--shadow-low),var(--gleam)}`, hover `border-color:var(--warn)`.

**Spacing rhythm:** rail section gap `margin-bottom:18-20px`; `h4` margin `2px 4px 9px`; detail sections `padding:14px 16px`; node flex gaps 5–7px; border radii cluster around 6–14px (chips 10, badges/buttons/segs 7–10, panels/cmdk 11–14, pills/altitude 20). Node positions are `%`-based (`left/top` set inline, `translate(-50%,-50%)` centering). Radial layouts: domains at radius 34/33 around center 50/52; surfaces at radius 30/28 around 50/54; angles `-90+i*(360/n)` (domains) and `20+i*(320/n)` (surfaces).

---

## 8. INTERACTION LOGIC (from `<script>`, summarized precisely)

**Data model:** `T` = 6 systems (vav, caney, crm, caneyrest, academy) each with `{name,color,pct,meta,pos:{x,y},summary,domains:[{n,s,sf:[surfaces],live?}]}`; `s`∈done/doing/needed. `IX` = 9 cross-system interchanges `ix1–ix9` (`{title,from:{s,d},to:{s,d},purpose,health,gi,route,contract,ver,summary,kvs,code,breaks}`). `EXT` = external services. `FUNCS`/`FNMAP`/`FNCOLOR` = function-overlay taxonomy mapping each `system|domain` to one of 6 business functions; `fnPct` computes function readiness (done=1, doing=.5).

**Drill-down navigation (`render`/`go`):** three altitudes per axis.
- *System axis* L0 Portfolio (system hubs + interchange spokes + stations) → L1 system (center hub + domains in a ring + mini-hubs for other systems in corners + focus-context cross-system threads) → L2 domain (center domain orb + surface nodes in arc + portals to linked systems). Clicking a hub/domain calls `go({level,t,d},origin)` with the node's `%` position as zoom origin.
- *Function axis* (`renderFunction`): L0 capability map (6 function hubs in 3×2 grid) → L1 function (members in ring, colored per owning system) → L2 surfaces (reuses `renderSurfaces`).
- `go()` performs the zoom-out/in scale+fade choreography (see §6); skipped under reduced-motion.
- `backbtn` and breadcrumb buttons (`data-go`/`data-fgo`) navigate up; both axes handled.

**Selection / detail panel:** clicking a node selects it (`.sel`) and renders a context-specific panel via `selPortfolio / selTerritory / selDomain / selSurface / selStation / selFunctionOverview / selFunction`. Each builds tailored HTML into `#detail` (build state %, links-out list, domain list, surface code preview, interchange flow producer/consumer + facts + contract + "what breaks" list). Several handlers are exposed on `window` so inline `onclick` strings work.

**Lenses (`setLens`)** set `html[data-lens]`, which CSS uses to dim/highlight:
- `navigation` neutral; `topology` dims non-xlink chips to `.32` and warns xlink borders; `liveness` dims `data-live="dead"` and pulses ok stations; `state` dims `needed` chips to `.5`; `function` recolors chip left-border + `.si` to the function color and reveals `.fn-only` legend.

**Audience presets (`setPreset`)** set `html[data-preset]` and map to a default lens: investor→state (and triggers the `reveal` sweep), agent→topology, operator→liveness.

**Axis toggle (`#axisSeg`)** flips `system`↔`function`, resets `focusFn`, re-renders at L0.

**Search:** flat `INDEX` of systems/domains/surfaces/links; `runSearch` filters (label/full/path includes), renders up to 8 results; ↑/↓ move `active`, Enter/click `pick()` navigates (and may `setTimeout` a `sel*` after the zoom). Clicking outside closes.

**Command palette (⌘K / Ctrl+K):** `COMMANDS` grouped Lenses/Audiences/Navigate + live node matches ("Jump to"); ↑/↓/Enter to run; click backdrop or Esc to close.

**Keyboard:** `⌘/Ctrl+K` toggle palette; `Esc` closes palette else zooms out; `/` focuses search; `⌘/Ctrl+1–5` jump to vav/caney/crm/caneyrest/academy. Search input has its own ↑/↓/Enter/Esc handling.

**Roadmap clustering (`visibleDomains`):** when a system has >1 `needed` domain and not expanded, they collapse into one dashed hatched "Roadmap · N needed ▸" cluster node; clicking expands (`expand:true`).

**Resize:** debounced 120ms re-render.

---

Source file: `/Users/tomas/.gstack/projects/arevalogutierrezbajares-spec---CRM---/designs/brain-canvas-20260621/finalized.html` (605 lines, fully read). All CSS quoted above is verbatim and paste-ready for React Flow token setup. Note: React Flow renders its own edges/nodes — the bowed-quadratic spoke math (control point `−36px` Y-bow), the conic-ring orb mask, the `--accent`/`--p`/`--fn` inline CSS-var pattern, and the dot-grid background (`radial-gradient circle at 1px 1px / 42px`) are the load-bearing visual recipes to port. React Flow's `colorMode="dark"` + a custom `Background variant="dots"` (gap 42, color `rgba(255,255,255,0.032)`) reproduces the canvas; nodes should be custom node components carrying the chip/orb anatomy and `data-state`/`data-xlink`/`data-fn`/`data-live` attributes so the lens CSS selectors work unchanged.