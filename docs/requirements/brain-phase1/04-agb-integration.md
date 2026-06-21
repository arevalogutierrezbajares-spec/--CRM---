I have all the information needed. Here is the integration guide.

---

# INTEGRATION GUIDE — Add authenticated route `/brain` to AGB-CRM

App root: `/Users/tomas/AGB-CRM`. Next.js **16.2.6** (App Router, Turbopack), React **19.2.4**, Tailwind **v4** (`@tailwindcss/postcss`), pnpm. Import alias `@/* → ./` (`tsconfig.json`).

---

## 1. ROUTING — where the page file goes

- Route group: `/Users/tomas/AGB-CRM/app/(app)/` — the `(app)` segment is a layout-only group (no URL prefix). Everything inside renders inside the authenticated chrome from `app/(app)/layout.tsx`.
- `app/(app)/layout.tsx` (`AppLayout`, an **async server component**) provides all chrome: `<Sidebar>`, `<Toaster>`, `<CommandPalette>` (⌘K), `<GlobalUploadModal>`, `<GlobalShortcuts>`, `<AmbientPlayer>`, `MotionProvider`, `PresenceProvider`, plus a skip-to-content link and `<div id="main-content">` that wraps `{children}`. **It does not render a `<TopBar>`** — each page renders its own `<TopBar>` (see Conventions).
- Existing `app/(app)/brain/` confirmed: holds **only** three server-action `.ts` files for the unrelated "reintro / conversation-memory / post-meeting" feature:
  - `actions.ts` (`"use server"`, `generateReintro`, AGB-403)
  - `conversation-memory.ts` (`"use server"`, AGB-404)
  - `post-meeting-actions.ts`
  - **No `page.tsx`, no `route.ts`, no `layout.tsx`** in that directory.

**Adding `page.tsx` there is safe.** A directory containing `"use server"` module files but no `page.tsx` currently produces **no `/brain` route at all** (those files are imported by other features as server actions, not route handlers). Dropping in:

```
/Users/tomas/AGB-CRM/app/(app)/brain/page.tsx
```

creates the `/brain` route without touching the existing files. Server-action files and `page.tsx` coexist in the same App Router directory by design — no naming collision (`page` vs `actions`/`conversation-memory`/`post-meeting-actions`). Recommended: keep the canvas client component in `components/brain/` (see §5/§7), not inside the route folder, matching the codebase pattern of thin route + components living under `components/`.

---

## 2. AUTH — the `(app)` group is already gated; new page needs nothing extra

Two independent layers both protect `/brain` automatically:

**Layer A — middleware (edge), the real gate.** Entry is `/Users/tomas/AGB-CRM/proxy.ts` (note: `proxy.ts`, not `middleware.ts` — Next 16 convention here), which calls `updateSession` from `/Users/tomas/AGB-CRM/lib/supabase/middleware.ts`. Its matcher runs on every non-static path. Logic: `supabase.auth.getUser()`; if no user and the path isn't in `PUBLIC_PATHS` (login, auth callbacks, token-authed API routes, etc.), it 307-redirects to `/login?next=<path>`. `/brain` is **not** public → already gated.

**Layer B — `requireUser()` in the layout/page.** `app/(app)/layout.tsx` calls `await requireUser()` (`/Users/tomas/AGB-CRM/lib/current-user.ts`), which runs `getCurrentUser()` and `redirect("/login")` if there's no session. It returns `SessionUser` (`{ id, email, displayName, workspaceId, workspaceRole, whatsappPhone, timezone }`) and idempotently ensures the user/workspace/membership rows exist.

**What your page must do:** Nothing for auth itself. But every page calls `requireUser()` again at the top to get the typed `user` (the layout's call doesn't pass it down). Use `user.workspaceId` to scope any DB reads:

```tsx
import { requireUser } from "@/lib/current-user";
export default async function BrainPage() {
  const user = await requireUser();
  // ... scope queries by user.workspaceId
}
```

Supabase server client: `createClient()` from `@/lib/supabase/server` (cookie-based SSR). Dev bypass exists (`AGB_DEV_FAKE_USER=1` + `NODE_ENV=development`) handled inside `requireUser`/middleware — you don't touch it.

---

## 3. DESIGN SYSTEM — tokens, fonts, dark mode

File: `/Users/tomas/AGB-CRM/app/globals.css`. Tailwind v4, `@import "tailwindcss"` + `@import "tw-animate-css"`. Tokens are CSS custom properties under `:root` and `.dark`, then re-exposed as Tailwind utilities via the `@theme inline { --color-* }` block — so e.g. `--color-text-primary` → `text-text-primary`, `--color-surface` → `bg-surface`.

**Dark mode:** class-based. `@custom-variant dark (&:is(.dark *))`. A `ThemeProvider` (`@/components/theme/theme-provider`, in root `app/layout.tsx`) toggles `.light`/`.dark` on `<html>`. Pre-hydration `@media (prefers-color-scheme: dark)` paints `#14130F` to avoid flash. **The canvas must read from tokens, not hardcoded colors, so it flips automatically.**

**Surfaces / text / borders**
| Purpose | Var | Tailwind util |
|---|---|---|
| Page bg | `--bg-page` (`#F5F4F0` / dark `#14130F`) | `bg-page` |
| Card bg | `--bg-card` (`#FFFFFF` / `#1C1B17`) | `bg-card` |
| Surface (hover/inset) | `--bg-surface` (`#F1EFE8` / `#23221D`) | `bg-surface` |
| Text primary | `--text-primary` | `text-text-primary` |
| Text secondary | `--text-secondary` | `text-text-secondary` |
| Text tertiary | `--text-tertiary` | `text-text-tertiary` |
| Border default | `--border-default` | `style={{ borderColor: "var(--border-default)" }}` or `border-border` |
| Border emphasis | `--border-emphasis` | — |

**Badge / semantic palettes** (each has `-bg`, `-text`, and most a `-mid`; all dark-aware): `blue`, `green`, `amber`, `red`, `purple`, `teal` → utilities `bg-blue-bg text-blue-text`, `bg-green-bg`, etc. Health: `--color-health-green/amber/red` → `text-health-green`. **AI accent (purple)** for AI/brain affordances: `--ai-bg`/`--ai-border`/`--ai-text`/`--ai-subtext` → `bg-ai-bg border-ai-border text-ai-text`.

**Shadcn aliases** also available: `bg-background bg-card bg-muted bg-accent text-foreground text-muted-foreground border-border ring-ring`, `bg-primary text-primary-foreground`, `bg-destructive`.

**Radii:** `--radius` 8px; tokens `--radius-sm/md/lg/xl` (6/8/12/16). **Fonts** (root `app/layout.tsx`, `next/font/google`): Inter → `--font-sans` (`font-sans`); JetBrains Mono → `--font-mono` (`font-mono`). Base `html { font-size: 14px }`. Utility classes: `.text-label` (11px uppercase tracking), `.text-body` (13px/1.6), `.text-tiny` (10px). Headings are weight 500, `letter-spacing -0.01em`. **`@xyflow/react` ships its own CSS — import `@xyflow/react/dist/style.css` in the canvas client component and override node/edge colors with the tokens above so light/dark both work.**

---

## 4. NAV — add a "Brain" entry (and it's not linked yet)

Confirmed: **no `/brain` link exists** anywhere in nav. Navigation is defined in **one** file, `/Users/tomas/AGB-CRM/components/layout/nav-groups.ts` (`NAV_GROUPS`, `NAV_FOOTER`, `ALL_NAV_LEAVES`). The flat ⌘K list (`components/layout/nav-items.ts → NAV_ITEMS`) and mobile nav are **derived** from it — edit `nav-groups.ts` only; never edit `nav-items.ts`.

Each leaf is `{ href, label, icon }` where `icon` is a `lucide-react` `LucideIcon`. The `Brain` icon **is already imported** in this file (currently used by Research). Pick a distinct icon to avoid confusion (e.g. `Network`/`Workflow`/`GitBranch`/`Sparkles`) and add the import to the lucide block at the top.

Add to the appropriate group's `items` (Plan or Explorer fits a "Brain" architecture map). Example — add to the `plan` group:

```ts
// in components/layout/nav-groups.ts, plan group's items array:
{ href: "/brain", label: "Brain", icon: Workflow },
```

That single edit lights it up in the sidebar (`components/layout/sidebar.tsx`, which maps `NAV_GROUPS`), the ⌘K palette, and mobile nav. Active-state highlighting is automatic: `sidebar.tsx`'s `isActive` does `pathname.startsWith(href)`.

---

## 5. CONVENTIONS — page/client-component pattern

Representative pages read: `app/(app)/overlord/page.tsx`, `app/(app)/roadmap/page.tsx`.

- **Pages are async server components.** No `"use client"` at the page level. Pattern:
  ```tsx
  import { requireUser } from "@/lib/current-user";
  import { TopBar } from "@/components/layout/top-bar";
  import { safeRead } from "@/lib/db-status";

  type SearchParams = Promise<{ /* ... */ }>;  // Next 16: searchParams is a Promise

  export default async function BrainPage(props: { searchParams: SearchParams }) {
    const user = await requireUser();
    const sp = await props.searchParams;
    // const data = await safeRead(() => someQuery(user.workspaceId), fallback);
    return (
      <>
        <TopBar email={user.email} displayName={user.displayName} />
        <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-6 space-y-4">
          {/* server-render header; mount the canvas client component here */}
        </main>
      </>
    );
  }
  ```
- **`<TopBar>` is per-page** (`@/components/layout/top-bar`), props `email`, `displayName`, optional `title`, `action`. The layout does not render it.
- **DB reads wrap in `safeRead`** (`@/lib/db-status`) → `{ ok, data }` with a fallback, so a DB outage degrades gracefully (`overlord` shows `<DbBanner>` when `!res.ok`). Queries live under `db/queries/*` and are scoped by `workspaceId`.
- **`"use client"` only in leaf components**, not pages. Server actions live in sibling `actions.ts` with top-of-file `"use server"` (the brain dir already follows this).
- **`next/dynamic` for client-only / heavy libs** — the established pattern is `/Users/tomas/AGB-CRM/components/lob/doc-editor-loader.tsx`:
  ```tsx
  "use client";
  import dynamic from "next/dynamic";
  export const BrainCanvas = dynamic(
    () => import("./brain-canvas").then((m) => m.BrainCanvas),
    { ssr: false, loading: () => /* spinner */ }
  );
  ```
  **Use this for the React Flow canvas** — `@xyflow/react` touches `window`/measures DOM, so it must be `ssr: false`, exactly like the BlockNote editor.
- **Component folders:** UI primitives in `components/ui/` (shadcn-style: `button`, `card`, `dialog`, `badge`, `input`, `select`, `popover`, `dropdown-menu`, `tooltip`, `sheet`, `skeleton`, etc.). Feature components in `components/<feature>/` (e.g. `components/overlord/`, `components/roadmap/`, `components/dashboard/shared/`). **Create `/Users/tomas/AGB-CRM/components/brain/`** for the canvas + sub-components.
- **`cn()` helper** from `@/lib/utils` (clsx + tailwind-merge) for conditional classes.
- **Imports always use `@/...`** alias.
- **Icons** from `lucide-react`; **toasts** via `sonner` (`import { toast } from "sonner"`).

---

## 6. DEPS — ⚠️ TASK ASSUMPTION IS WRONG: they are ALREADY installed

The task said to confirm `@xyflow/react`, `elkjs`, `d3-hierarchy` are NOT installed. **They are installed and pinned in `package.json` already** (verified in `node_modules`, `pnpm-lock.yaml`, and `package.json` dependencies):

```
@xyflow/react      ^12.11.0   (installed 12.11.0)
elkjs              ^0.11.1    (installed 0.11.1)
d3-hierarchy       ^3.1.2     (installed 3.1.2)
@types/d3-hierarchy ^3.1.7    (devDep, installed 3.1.7)   ← types also present
```

They are present but **currently unused** — `grep` for `@xyflow/react|elkjs|d3-hierarchy|reactflow` across `app/`, `components/`, `lib/` returns **zero imports**. They were clearly pre-added for this brain-canvas build. **No install step is needed.** (If for any reason a reinstall is wanted, the command is `pnpm install`; to add anything new use `pnpm add <pkg>` — pnpm is the package manager, `pnpm-lock.yaml` + `pnpm-workspace.yaml` present.)

Also confirmed present and usable:
- `framer-motion` **^12.40.0** (installed) — animation. The layout wraps children in `MotionProvider` (`@/components/motion-provider`).
- `cmdk` **^1.1.1** (installed) — see §7.
- `@radix-ui/react-dialog` **^1.1.15**, plus `react-popover`, `react-tooltip`, `react-dropdown-menu`, `react-select` — all installed.

---

## 7. COMPONENT PATTERNS the brain UI should reuse

- **⌘K command palette already exists** — `/Users/tomas/AGB-CRM/components/command/command-palette.tsx` (`CommandPalette`), mounted globally in `app/(app)/layout.tsx`. It uses **`cmdk`** (`import { Command } from "cmdk"` → `Command.Dialog` / `Command.Input` / `Command.List` / `Command.Group` / `Command.Item`), with `shouldFilter={false}` and a custom `fuzzyScore`/`rank`. It opens on ⌘K/Ctrl-K and via the `"open-command-palette"` window event (`openCommandPalette()` exported). **Do not build a second global cmd-K palette.** If `/brain` needs a node-search/jump palette scoped to the canvas, reuse the same `cmdk` `Command.Dialog` pattern (copy the structure from this file) rather than introducing a new lib. If you want to register Brain destinations in the existing palette, they already flow in via `NAV_ITEMS` once you add the nav entry (§4).
- **Dialogs / modals** — use `@/components/ui/dialog` (Radix-based: `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogTrigger`, `DialogClose`), already token-styled (`bg-[var(--background)]`, `border-[var(--border)]`). For node-detail side panels prefer `@/components/ui/sheet`; for hovercards use `@/components/ui/popover` / `@/components/ui/tooltip`.
- **Buttons / badges / cards** — `@/components/ui/button`, `@/components/ui/badge` (uses the semantic palettes), `@/components/ui/card`. Section labels: `@/components/dashboard/shared/section-label` (`SectionLabel`, takes a lucide `icon`) and the `DashCard` wrapper (`@/components/dashboard/shared/dash-card`) used in overlord.
- **DB-outage banner** — `@/components/db-banner` (`DbBanner`) paired with `safeRead`.
- **Theme** flips via `.dark` class on `<html>`; the canvas styles must use CSS vars (§3) so React Flow nodes/edges/background recolor automatically.

---

### Quick build checklist for the build agent
1. Create `/Users/tomas/AGB-CRM/app/(app)/brain/page.tsx` (async server component, `requireUser()` + `<TopBar>` + `<main className="mx-auto w-full max-w-7xl flex-1 px-6 py-6">`). Safe — coexists with existing `actions.ts`/`conversation-memory.ts`/`post-meeting-actions.ts`.
2. Create `/Users/tomas/AGB-CRM/components/brain/` with `brain-canvas-loader.tsx` (`next/dynamic`, `ssr:false`) wrapping `brain-canvas.tsx` (`"use client"`, imports `@xyflow/react` + `@xyflow/react/dist/style.css`; use `elkjs`/`d3-hierarchy` for layout). Mount the loader from `page.tsx`.
3. Add one nav leaf `{ href: "/brain", label: "Brain", icon: <Lucide> }` to a group in `/Users/tomas/AGB-CRM/components/layout/nav-groups.ts` (import the icon at top). Do not edit `nav-items.ts`.
4. Style everything from CSS-var tokens in `app/globals.css` (light + dark).
5. No dependency installs needed — `@xyflow/react`, `elkjs`, `d3-hierarchy`, `@types/d3-hierarchy`, `framer-motion`, `cmdk`, `@radix-ui/react-dialog` are all already installed.
6. Auth requires nothing extra — `(app)` layout + `proxy.ts` middleware already gate `/brain`; just call `requireUser()` in the page to get `user.workspaceId`.

Typecheck with `npx tsc --noEmit`; dev server `npm run dev`.