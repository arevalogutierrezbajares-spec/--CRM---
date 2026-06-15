"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import {
  Building2,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDashed,
  CreditCard,
  DoorOpen,
  KeyRound,
  ListPlus,
  Pencil,
  Plus,
  RotateCcw,
  Send,
  Tag,
  Trash2,
  TriangleAlert,
  Wallet,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AMENITY_GROUPS,
  AMENITY_LABELS,
  BED_TYPE_LABELS,
  CANONICAL_BED_TYPES,
  CANONICAL_CURRENCIES,
  CURRENCY_LABELS,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  SESSION_ID_RE,
  areaLabel,
  buildRecords,
  cancellationRuleSchema,
  computeReadiness,
  emptyDraft,
  expandRoomNumbers,
  intakeDraftSchema,
  ratePlanSchema,
  removeRoomTypeCascade,
  replaceRoomType,
  roomSchema,
  roomTypeDependents,
  roomTypeSchema,
  type CanonicalAmenity,
  type CanonicalBedType,
  type CanonicalCurrency,
  type IntakeDraft,
  type PaymentMethod,
  type ReadinessArea,
  type RatePlanDraft,
  type RoomDraft,
  type RoomTypeDraft,
  type CancellationRuleDraft,
} from "@/lib/onboarding/intake-contract";
import { submitIntake, type SubmitResult } from "@/app/(app)/posada-onboarding/actions";

const DRAFT_KEY = "posada-intake:draft";
const SESSION_KEY = "posada-intake:session";

const STEPS = [
  { key: "connect", label: "Conexión", icon: KeyRound },
  { key: "property", label: "Posada", icon: Building2 },
  { key: "roomTypes", label: "Tipos", icon: Tag },
  { key: "rooms", label: "Habitaciones", icon: DoorOpen },
  { key: "ratePlans", label: "Tarifas", icon: CreditCard },
  { key: "policies", label: "Pagos y políticas", icon: Wallet },
  { key: "review", label: "Revisar", icon: Send },
] as const;

/** Which step lets the operator fix each required area (for jump-to-fix). */
const AREA_STEP: Record<ReadinessArea, number> = {
  property_profile: 1,
  room_type: 2,
  room: 3,
  rate_plan: 4,
};

type Props = {
  initialSessionId: string;
  initialImportToken: string;
};

export function IntakeWizard({ initialSessionId, initialImportToken }: Props) {
  const [step, setStep] = useState(0);
  const [sessionId, setSessionId] = useState(initialSessionId);
  const [importToken, setImportToken] = useState(initialImportToken);
  const [draft, setDraft] = useState<IntakeDraft>(emptyDraft());
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [pending, startTransition] = useTransition();
  const hydrated = useRef(false);

  // Draft persistence: survive a refresh or a token re-fetch mid-flow. The
  // import token is intentionally NOT persisted (short-lived secret).
  useEffect(() => {
    let stored: IntakeDraft | null = null;
    let storedSession: string | null = null;
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const parsed = intakeDraftSchema.safeParse(JSON.parse(raw));
        if (parsed.success) stored = parsed.data;
      }
      if (!initialSessionId) storedSession = localStorage.getItem(SESSION_KEY);
    } catch {
      /* ignore corrupt storage */
    }
    // Defer state out of the synchronous effect body (lint: set-state-in-effect).
    queueMicrotask(() => {
      if (stored) setDraft(stored);
      if (storedSession) setSessionId(storedSession);
      hydrated.current = true;
    });
  }, [initialSessionId]);

  useEffect(() => {
    if (!hydrated.current) return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      /* quota / private mode — non-fatal */
    }
  }, [draft]);

  useEffect(() => {
    if (!hydrated.current) return;
    try {
      if (sessionId.trim()) localStorage.setItem(SESSION_KEY, sessionId.trim());
      else localStorage.removeItem(SESSION_KEY);
    } catch {
      /* non-fatal */
    }
  }, [sessionId]);

  const readiness = useMemo(() => computeReadiness(draft), [draft]);
  const roomTypeNames = useMemo(
    () => draft.roomTypes.map((rt) => rt.name.trim()).filter(Boolean),
    [draft.roomTypes],
  );
  const draftParse = useMemo(() => intakeDraftSchema.safeParse(draft), [draft]);
  const connectionValid =
    SESSION_ID_RE.test(sessionId.trim()) && importToken.trim().length > 0;
  const canSubmit = connectionValid && draftParse.success && !pending;
  const hasContent =
    draft.property.name.trim().length > 0 ||
    draft.roomTypes.length > 0 ||
    draft.rooms.length > 0;

  function onSubmit() {
    setResult(null);
    startTransition(async () => {
      const r = await submitIntake({
        sessionId: sessionId.trim(),
        importToken: importToken.trim(),
        draft,
      });
      setResult(r);
    });
  }

  function clearDraft() {
    setDraft(emptyDraft());
    setResult(null);
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      /* non-fatal */
    }
  }

  return (
    <div className="space-y-6">
      <Stepper step={step} draft={draft} onJump={setStep} />

      <ReadinessStrip readiness={readiness} onJump={setStep} />

      {step === 0 && (
        <ConnectionStep
          sessionId={sessionId}
          importToken={importToken}
          onSessionId={setSessionId}
          onImportToken={setImportToken}
          valid={connectionValid}
          prefilled={Boolean(initialSessionId || initialImportToken)}
        />
      )}

      {step === 1 && (
        <PropertyStep
          draft={draft}
          onChange={(property) => setDraft((d) => ({ ...d, property }))}
        />
      )}

      {step === 2 && <RoomTypesStep draft={draft} setDraft={setDraft} />}
      {step === 3 && <RoomsStep draft={draft} roomTypeNames={roomTypeNames} setDraft={setDraft} onJump={setStep} />}
      {step === 4 && <RatePlansStep draft={draft} roomTypeNames={roomTypeNames} setDraft={setDraft} onJump={setStep} />}
      {step === 5 && <PoliciesStep draft={draft} setDraft={setDraft} />}

      {step === 6 && (
        <ReviewStep
          draft={draft}
          readiness={readiness}
          sessionId={sessionId}
          importToken={importToken}
          onSessionId={setSessionId}
          onImportToken={setImportToken}
          connectionValid={connectionValid}
          firstError={draftParse.success ? null : firstIssue(draftParse)}
          result={result}
          pending={pending}
          canSubmit={canSubmit}
          onSubmit={onSubmit}
          onJump={setStep}
        />
      )}

      <StepFooter
        step={step}
        lastStep={STEPS.length - 1}
        onBack={() => setStep((s) => Math.max(0, s - 1))}
        onNext={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
        nextDisabled={step === 0 && !connectionValid}
        hasContent={hasContent}
        onClear={clearDraft}
      />
    </div>
  );
}

type DraftParse = ReturnType<typeof intakeDraftSchema.safeParse>;
function firstIssue(parse: DraftParse): { area: ReadinessArea | null; message: string } | null {
  if (parse.success) return null;
  const issue = parse.error.issues[0];
  if (!issue) return null;
  const head = issue.path[0];
  const area: ReadinessArea | null =
    head === "roomTypes" ? "room_type" : head === "rooms" ? "room" : head === "ratePlans" ? "rate_plan" : head === "property" ? "property_profile" : null;
  return { area, message: issue.message };
}

// --------------------------------------------------------------------------- //
// Stepper + readiness                                                           //
// --------------------------------------------------------------------------- //
const STEP_COUNT: Record<string, (d: IntakeDraft) => number> = {
  roomTypes: (d) => d.roomTypes.length,
  rooms: (d) => d.rooms.length,
  ratePlans: (d) => d.ratePlans.length,
  policies: (d) => d.cancellationRules.length + (d.payment.methods.length > 0 ? 1 : 0),
};

function Stepper({ step, draft, onJump }: { step: number; draft: IntakeDraft; onJump: (i: number) => void }) {
  return (
    <ol className="flex flex-wrap items-center gap-1 text-xs">
      {STEPS.map((s, i) => {
        const Icon = s.icon;
        const active = i === step;
        const done = i < step;
        const count = STEP_COUNT[s.key]?.(draft);
        return (
          <li key={s.key}>
            <button
              type="button"
              onClick={() => onJump(i)}
              aria-current={active ? "step" : undefined}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 transition-colors",
                active
                  ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)]"
                  : "border-[var(--border)] text-[var(--muted-foreground)] hover:bg-[var(--accent)]",
              )}
            >
              {done ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
              <span>{s.label}</span>
              {typeof count === "number" && count > 0 && (
                <span
                  className={cn(
                    "ml-0.5 rounded-full px-1.5 text-[10px] tabular-nums",
                    active ? "bg-[var(--primary-foreground)]/20" : "bg-[var(--muted)]",
                  )}
                >
                  {count}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function ReadinessStrip({
  readiness,
  onJump,
}: {
  readiness: ReturnType<typeof computeReadiness>;
  onJump: (i: number) => void;
}) {
  const areas = Object.keys(readiness.areas) as ReadinessArea[];
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-xs"
    >
      <span className="font-medium text-[var(--muted-foreground)]">Datos mínimos para activar:</span>
      {areas.map((a) => {
        const ok = readiness.areas[a];
        return (
          <button
            key={a}
            type="button"
            onClick={() => onJump(AREA_STEP[a])}
            title={ok ? `${areaLabel(a)} — listo` : `${areaLabel(a)} — falta, ir al paso`}
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 transition-colors",
              ok
                ? "bg-[var(--primary)]/10 text-[var(--primary)]"
                : "bg-[var(--muted)] text-[var(--muted-foreground)] hover:ring-1 hover:ring-[var(--ring)]",
            )}
          >
            {ok ? <CheckCircle2 className="h-3 w-3" /> : <CircleDashed className="h-3 w-3" />}
            {areaLabel(a)}
          </button>
        );
      })}
      <span className="ml-auto font-medium">
        {readiness.ready ? (
          <span className="text-[var(--primary)]">Listo ✓</span>
        ) : (
          <span className="text-[var(--muted-foreground)]">{readiness.blocking.length} pendiente(s)</span>
        )}
      </span>
    </div>
  );
}

// --------------------------------------------------------------------------- //
// Layout helpers                                                                //
// --------------------------------------------------------------------------- //
function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      {description && <p className="mt-1 text-sm text-[var(--muted-foreground)]">{description}</p>}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

function Field({ label, children, hint, error }: { label: string; children: ReactNode; hint?: string; error?: string }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {error ? (
        <p role="alert" className="text-xs text-[var(--destructive)]">
          {error}
        </p>
      ) : (
        hint && <p className="text-xs text-[var(--muted-foreground)]">{hint}</p>
      )}
    </div>
  );
}

// --------------------------------------------------------------------------- //
// Step: connection                                                              //
// --------------------------------------------------------------------------- //
function ConnectionStep({
  sessionId,
  importToken,
  onSessionId,
  onImportToken,
  valid,
  prefilled,
}: {
  sessionId: string;
  importToken: string;
  onSessionId: (v: string) => void;
  onImportToken: (v: string) => void;
  valid: boolean;
  prefilled: boolean;
}) {
  const idLooksValid = sessionId.trim() === "" || SESSION_ID_RE.test(sessionId.trim());
  return (
    <Section
      title="Conectar con la sesión del PMS"
      description="Pega el ID de sesión y el token de importación de la consola del PMS, o abre esta página con el enlace que la consola genera. Tus datos se guardan solos: si el token caduca, pide uno nuevo y vuelve aquí sin perder nada."
    >
      {prefilled && <Banner tone="ok">Datos recibidos por enlace. Verifícalos antes de continuar.</Banner>}
      <Field label="ID de sesión" hint="UUID de la sesión de onboarding del PMS." error={idLooksValid ? undefined : "El ID de sesión debe ser un UUID válido."}>
        <Input
          value={sessionId}
          onChange={(e) => onSessionId(e.target.value)}
          placeholder="00000000-0000-0000-0000-000000000000"
          spellCheck={false}
          aria-invalid={!idLooksValid}
        />
      </Field>
      <Field label="Token de importación" hint="Caduca a los 10 minutos. Si expira, pide uno nuevo en el PMS y pégalo aquí — tus datos siguen guardados.">
        <Textarea
          value={importToken}
          onChange={(e) => onImportToken(e.target.value)}
          placeholder="eyJ...   (token firmado del PMS)"
          spellCheck={false}
          className="font-mono text-xs"
        />
      </Field>
      <div className="text-xs text-[var(--muted-foreground)]">
        {valid ? (
          <span className="inline-flex items-center gap-1 text-[var(--primary)]">
            <CheckCircle2 className="h-3.5 w-3.5" /> Conexión lista — continúa con los datos de la posada.
          </span>
        ) : (
          "Completa ambos campos para continuar."
        )}
      </div>
    </Section>
  );
}

// --------------------------------------------------------------------------- //
// Step: property                                                                //
// --------------------------------------------------------------------------- //
function PropertyStep({ draft, onChange }: { draft: IntakeDraft; onChange: (p: IntakeDraft["property"]) => void }) {
  return (
    <Section title="Datos de la posada" description="El nombre es obligatorio. Dirección y zona horaria son opcionales.">
      <Field label="Nombre de la posada *">
        <Input value={draft.property.name} onChange={(e) => onChange({ ...draft.property, name: e.target.value })} placeholder="Posada Bolívar" />
      </Field>
      <Field label="Dirección">
        <Input value={draft.property.address ?? ""} onChange={(e) => onChange({ ...draft.property, address: e.target.value })} placeholder="Calle, sector, estado" />
      </Field>
      <Field label="Zona horaria" hint="Por defecto America/Caracas.">
        <Input value={draft.property.timezone ?? ""} onChange={(e) => onChange({ ...draft.property, timezone: e.target.value })} placeholder="America/Caracas" />
      </Field>
    </Section>
  );
}

// --------------------------------------------------------------------------- //
// Step: room types (add + inline edit + cascade remove)                         //
// --------------------------------------------------------------------------- //
function RoomTypesStep({ draft, setDraft }: { draft: IntakeDraft; setDraft: Dispatch<SetStateAction<IntakeDraft>> }) {
  const [editing, setEditing] = useState<number | null>(null);
  const otherNames = draft.roomTypes.filter((_, i) => i !== editing).map((rt) => rt.name.trim());

  return (
    <Section title="Tipos de habitación" description="Define cada tipo (p. ej. Doble, Suite). Las habitaciones y tarifas se asignan a un tipo.">
      <ItemList
        items={draft.roomTypes.map((rt) => ({
          title: rt.name,
          meta: `${rt.maxOccupancy} pax${rt.bedType ? ` · ${BED_TYPE_LABELS[rt.bedType]}` : ""}${rt.amenities.length ? ` · ${rt.amenities.length} amenidades` : ""}`,
        }))}
        activeIndex={editing}
        onEdit={(i) => setEditing(i)}
        onRemove={(i) => {
          const dep = roomTypeDependents(draft, draft.roomTypes[i].name);
          if (dep.rooms + dep.ratePlans > 0) return; // handled by InlineConfirm via removeConfirm below
          setDraft((d) => removeRoomTypeCascade(d, i));
          if (editing === i) setEditing(null);
        }}
        confirmRemove={(i) => {
          const dep = roomTypeDependents(draft, draft.roomTypes[i].name);
          return dep.rooms + dep.ratePlans > 0
            ? `Quitará también ${dep.rooms} habitación(es) y ${dep.ratePlans} tarifa(s) que usan este tipo.`
            : null;
        }}
        onConfirmRemove={(i) => {
          setDraft((d) => removeRoomTypeCascade(d, i));
          if (editing === i) setEditing(null);
        }}
        emptyText="Aún no hay tipos de habitación."
      />
      <AddRoomTypeForm
        key={editing ?? "new"}
        initial={editing != null ? draft.roomTypes[editing] : undefined}
        otherNames={otherNames}
        onSubmit={(rt) => {
          if (editing != null) setDraft((d) => replaceRoomType(d, editing, rt));
          else setDraft((d) => ({ ...d, roomTypes: [...d.roomTypes, rt] }));
          setEditing(null);
        }}
        onCancel={editing != null ? () => setEditing(null) : undefined}
      />
    </Section>
  );
}

function AddRoomTypeForm({
  initial,
  otherNames,
  onSubmit,
  onCancel,
}: {
  initial?: RoomTypeDraft;
  otherNames: string[];
  onSubmit: (rt: RoomTypeDraft) => void;
  onCancel?: () => void;
}) {
  const editing = initial !== undefined;
  const [name, setName] = useState(initial?.name ?? "");
  const [occupancy, setOccupancy] = useState(String(initial?.maxOccupancy ?? 2));
  const [bedType, setBedType] = useState<CanonicalBedType | "none">(initial?.bedType ?? "none");
  const [amenities, setAmenities] = useState<CanonicalAmenity[]>(initial?.amenities ?? []);
  const [error, setError] = useState<string | null>(null);

  function toggle(a: CanonicalAmenity) {
    setAmenities((prev) => (prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]));
  }
  function submit() {
    if (otherNames.includes(name.trim())) return setError("Ya existe un tipo con ese nombre.");
    const parsed = roomTypeSchema.safeParse({ name, maxOccupancy: Number(occupancy), bedType: bedType === "none" ? null : bedType, amenities });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Datos inválidos.");
    onSubmit(parsed.data);
  }

  return (
    <AddCard editing={editing} title={editing ? "Editar tipo" : "Nuevo tipo"}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nombre del tipo *">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Habitación Doble" onKeyDown={onEnter(submit)} autoFocus={editing} />
        </Field>
        <Field label="Capacidad (pax) *">
          <Input type="number" min={1} value={occupancy} onChange={(e) => setOccupancy(e.target.value)} onKeyDown={onEnter(submit)} />
        </Field>
      </div>
      <Field label="Tipo de cama">
        <Select value={bedType} onValueChange={(v) => setBedType(v as CanonicalBedType | "none")}>
          <SelectTrigger>
            <SelectValue placeholder="Sin especificar" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Sin especificar</SelectItem>
            {CANONICAL_BED_TYPES.map((b) => (
              <SelectItem key={b} value={b}>
                {BED_TYPE_LABELS[b]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Amenidades">
        <div className="space-y-3">
          {AMENITY_GROUPS.map((g) => (
            <div key={g.key}>
              <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">{g.label}</p>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                {g.amenities.map((a) => (
                  <label key={a} className="flex cursor-pointer items-center gap-2 rounded-md border border-[var(--border)] px-2 py-1.5 text-xs hover:bg-[var(--accent)]">
                    <Checkbox checked={amenities.includes(a)} onCheckedChange={() => toggle(a)} />
                    {AMENITY_LABELS[a]}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Field>
      {error && <p role="alert" className="text-xs text-[var(--destructive)]">{error}</p>}
      <FormActions editing={editing} onSubmit={submit} onCancel={onCancel} addLabel="Agregar tipo" />
    </AddCard>
  );
}

// --------------------------------------------------------------------------- //
// Step: rooms (single + bulk range + inline edit)                               //
// --------------------------------------------------------------------------- //
function RoomsStep({
  draft,
  roomTypeNames,
  setDraft,
  onJump,
}: {
  draft: IntakeDraft;
  roomTypeNames: string[];
  setDraft: Dispatch<SetStateAction<IntakeDraft>>;
  onJump: (i: number) => void;
}) {
  const [editing, setEditing] = useState<number | null>(null);
  const existingNumbers = draft.rooms.map((r) => r.roomNumber.trim());

  return (
    <Section title="Habitaciones" description="Cada habitación se asigna a un tipo. Puedes agregar varias de una vez con un rango (101-110).">
      {roomTypeNames.length === 0 ? (
        <EmptyDependency onJump={() => onJump(2)} />
      ) : (
        <>
          <ItemList
            items={draft.rooms.map((r) => ({ title: `Hab. ${r.roomNumber}`, meta: r.roomTypeName }))}
            activeIndex={editing}
            onEdit={(i) => setEditing(i)}
            onRemove={(i) => {
              setDraft((d) => ({ ...d, rooms: d.rooms.filter((_, idx) => idx !== i) }));
              if (editing === i) setEditing(null);
            }}
            emptyText="Aún no hay habitaciones."
          />
          <AddRoomForm
            key={editing ?? "new"}
            initial={editing != null ? draft.rooms[editing] : undefined}
            roomTypeNames={roomTypeNames}
            existingNumbers={existingNumbers}
            onSubmit={(room) => {
              if (editing != null) setDraft((d) => ({ ...d, rooms: d.rooms.map((r, i) => (i === editing ? room : r)) }));
              else setDraft((d) => ({ ...d, rooms: [...d.rooms, room] }));
              setEditing(null);
            }}
            onAddMany={(numbers, roomTypeName) => {
              const have = new Set(existingNumbers);
              const fresh = numbers.filter((n) => !have.has(n));
              setDraft((d) => ({ ...d, rooms: [...d.rooms, ...fresh.map((n) => ({ roomNumber: n, roomTypeName }))] }));
              return { added: fresh.length, skipped: numbers.length - fresh.length };
            }}
            onCancel={editing != null ? () => setEditing(null) : undefined}
          />
        </>
      )}
    </Section>
  );
}

function AddRoomForm({
  initial,
  roomTypeNames,
  existingNumbers,
  onSubmit,
  onAddMany,
  onCancel,
}: {
  initial?: RoomDraft;
  roomTypeNames: string[];
  existingNumbers: string[];
  onSubmit: (room: RoomDraft) => void;
  onAddMany: (numbers: string[], roomTypeName: string) => { added: number; skipped: number };
  onCancel?: () => void;
}) {
  const editing = initial !== undefined;
  const [mode, setMode] = useState<"single" | "bulk">("single");
  const [roomNumber, setRoomNumber] = useState(initial?.roomNumber ?? "");
  const [bulk, setBulk] = useState("");
  const [roomTypeName, setRoomTypeName] = useState(initial?.roomTypeName ?? roomTypeNames[0] ?? "");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const typeValid = roomTypeNames.includes(roomTypeName);

  function addSingle() {
    setNote(null);
    const parsed = roomSchema.safeParse({ roomNumber, roomTypeName });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Datos inválidos.");
    if (!typeValid) return setError("Selecciona un tipo de habitación válido.");
    if (!editing && existingNumbers.includes(parsed.data.roomNumber)) return setError(`Ya existe la habitación ${parsed.data.roomNumber}.`);
    onSubmit(parsed.data);
    setRoomNumber("");
    setError(null);
  }
  function addBulk() {
    setError(null);
    if (!typeValid) return setError("Selecciona un tipo de habitación válido.");
    const { numbers, errors } = expandRoomNumbers(bulk);
    if (numbers.length === 0) return setError(errors[0] ?? "Escribe al menos un número o rango (p. ej. 101-110).");
    const { added, skipped } = onAddMany(numbers, roomTypeName);
    setBulk("");
    setNote(`${added} habitación(es) agregada(s)${skipped ? `, ${skipped} ya existían` : ""}${errors.length ? `. ${errors[0]}` : ""}.`);
  }

  return (
    <AddCard editing={editing} title={editing ? "Editar habitación" : "Agregar habitaciones"}>
      {!editing && (
        <Segmented
          value={mode}
          onChange={(v) => { setMode(v as "single" | "bulk"); setError(null); setNote(null); }}
          options={[{ value: "single", label: "Una" }, { value: "bulk", label: "Varias (rango)" }]}
        />
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {editing || mode === "single" ? (
          <Field label="Número / nombre *">
            <Input value={roomNumber} onChange={(e) => setRoomNumber(e.target.value)} placeholder="101" onKeyDown={onEnter(addSingle)} autoFocus={editing} />
          </Field>
        ) : (
          <Field label="Números o rangos *" hint="Coma o salto de línea. Ej.: 101-110, 201, 202">
            <Textarea value={bulk} onChange={(e) => setBulk(e.target.value)} placeholder="101-110, 201, 202" className="min-h-[72px]" />
          </Field>
        )}
        <Field label="Tipo de habitación *">
          <Select value={roomTypeName} onValueChange={setRoomTypeName}>
            <SelectTrigger>
              <SelectValue placeholder="Selecciona" />
            </SelectTrigger>
            <SelectContent>
              {roomTypeNames.map((n) => (
                <SelectItem key={n} value={n}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
      {error && <p role="alert" className="text-xs text-[var(--destructive)]">{error}</p>}
      {note && <p className="text-xs text-[var(--primary)]">{note}</p>}
      {editing ? (
        <FormActions editing onSubmit={addSingle} onCancel={onCancel} addLabel="" />
      ) : mode === "single" ? (
        <Button type="button" variant="outline" size="sm" onClick={addSingle}>
          <Plus className="h-4 w-4" /> Agregar habitación
        </Button>
      ) : (
        <Button type="button" variant="outline" size="sm" onClick={addBulk}>
          <ListPlus className="h-4 w-4" /> Agregar rango
        </Button>
      )}
    </AddCard>
  );
}

// --------------------------------------------------------------------------- //
// Step: rate plans (add + inline edit)                                          //
// --------------------------------------------------------------------------- //
function RatePlansStep({
  draft,
  roomTypeNames,
  setDraft,
  onJump,
}: {
  draft: IntakeDraft;
  roomTypeNames: string[];
  setDraft: Dispatch<SetStateAction<IntakeDraft>>;
  onJump: (i: number) => void;
}) {
  const [editing, setEditing] = useState<number | null>(null);
  return (
    <Section title="Tarifas" description="Tarifa base por tipo de habitación y moneda.">
      {roomTypeNames.length === 0 ? (
        <EmptyDependency onJump={() => onJump(2)} />
      ) : (
        <>
          <ItemList
            items={draft.ratePlans.map((rp) => ({ title: `${rp.roomTypeName} · ${rp.name || "standard"}`, meta: `${rp.baseRate} ${rp.currency}` }))}
            activeIndex={editing}
            onEdit={(i) => setEditing(i)}
            onRemove={(i) => {
              setDraft((d) => ({ ...d, ratePlans: d.ratePlans.filter((_, idx) => idx !== i) }));
              if (editing === i) setEditing(null);
            }}
            emptyText="Aún no hay tarifas."
          />
          <AddRatePlanForm
            key={editing ?? "new"}
            initial={editing != null ? draft.ratePlans[editing] : undefined}
            roomTypeNames={roomTypeNames}
            onSubmit={(rp) => {
              if (editing != null) setDraft((d) => ({ ...d, ratePlans: d.ratePlans.map((x, i) => (i === editing ? rp : x)) }));
              else setDraft((d) => ({ ...d, ratePlans: [...d.ratePlans, rp] }));
              setEditing(null);
            }}
            onCancel={editing != null ? () => setEditing(null) : undefined}
          />
        </>
      )}
    </Section>
  );
}

function AddRatePlanForm({
  initial,
  roomTypeNames,
  onSubmit,
  onCancel,
}: {
  initial?: RatePlanDraft;
  roomTypeNames: string[];
  onSubmit: (rp: RatePlanDraft) => void;
  onCancel?: () => void;
}) {
  const editing = initial !== undefined;
  const [roomTypeName, setRoomTypeName] = useState(initial?.roomTypeName ?? roomTypeNames[0] ?? "");
  const [name, setName] = useState(initial?.name ?? "standard");
  const [baseRate, setBaseRate] = useState(initial ? String(initial.baseRate) : "");
  const [currency, setCurrency] = useState<CanonicalCurrency>(initial?.currency ?? "USD");
  const [error, setError] = useState<string | null>(null);

  function submit() {
    if (baseRate.trim() === "") return setError("Escribe la tarifa base.");
    const parsed = ratePlanSchema.safeParse({ roomTypeName, name, baseRate: Number(baseRate), currency });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Datos inválidos.");
    if (!roomTypeNames.includes(parsed.data.roomTypeName)) return setError("Selecciona un tipo de habitación válido.");
    onSubmit(parsed.data);
  }

  return (
    <AddCard editing={editing} title={editing ? "Editar tarifa" : "Nueva tarifa"}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Tipo de habitación *">
          <Select value={roomTypeName} onValueChange={setRoomTypeName}>
            <SelectTrigger>
              <SelectValue placeholder="Selecciona" />
            </SelectTrigger>
            <SelectContent>
              {roomTypeNames.map((n) => (
                <SelectItem key={n} value={n}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Nombre del plan">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="standard" onKeyDown={onEnter(submit)} />
        </Field>
        <Field label="Tarifa base *">
          <Input type="number" min={0} step="0.01" value={baseRate} onChange={(e) => setBaseRate(e.target.value)} placeholder="45" onKeyDown={onEnter(submit)} />
        </Field>
        <Field label="Moneda *">
          <Select value={currency} onValueChange={(v) => setCurrency(v as CanonicalCurrency)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CANONICAL_CURRENCIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {CURRENCY_LABELS[c]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
      {error && <p role="alert" className="text-xs text-[var(--destructive)]">{error}</p>}
      <FormActions editing={editing} onSubmit={submit} onCancel={onCancel} addLabel="Agregar tarifa" />
    </AddCard>
  );
}

// --------------------------------------------------------------------------- //
// Step: policies + payment                                                      //
// --------------------------------------------------------------------------- //
function PoliciesStep({ draft, setDraft }: { draft: IntakeDraft; setDraft: Dispatch<SetStateAction<IntakeDraft>> }) {
  const [editing, setEditing] = useState<number | null>(null);
  function togglePayment(m: PaymentMethod) {
    setDraft((d) => {
      const has = d.payment.methods.includes(m);
      return { ...d, payment: { methods: has ? d.payment.methods.filter((x) => x !== m) : [...d.payment.methods, m] } };
    });
  }
  return (
    <div className="space-y-6">
      <Section title="Métodos de pago" description="Opcional. Selecciona los que acepta la posada.">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {PAYMENT_METHODS.map((m) => (
            <label key={m} className="flex cursor-pointer items-center gap-2 rounded-md border border-[var(--border)] px-3 py-2 text-sm hover:bg-[var(--accent)]">
              <Checkbox checked={draft.payment.methods.includes(m)} onCheckedChange={() => togglePayment(m)} />
              {PAYMENT_METHOD_LABELS[m]}
            </label>
          ))}
        </div>
      </Section>
      <Section title="Políticas de cancelación" description="Opcional. Define tramos de reembolso.">
        <ItemList
          items={draft.cancellationRules.map((cr) => ({ title: cr.tierName, meta: `${cr.refundPercentage}% si cancela ≥ ${cr.timeBoundaryHours}h antes` }))}
          activeIndex={editing}
          onEdit={(i) => setEditing(i)}
          onRemove={(i) => {
            setDraft((d) => ({ ...d, cancellationRules: d.cancellationRules.filter((_, idx) => idx !== i) }));
            if (editing === i) setEditing(null);
          }}
          emptyText="Aún no hay políticas."
        />
        <AddCancellationForm
          key={editing ?? "new"}
          initial={editing != null ? draft.cancellationRules[editing] : undefined}
          onSubmit={(rule) => {
            if (editing != null) setDraft((d) => ({ ...d, cancellationRules: d.cancellationRules.map((x, i) => (i === editing ? rule : x)) }));
            else setDraft((d) => ({ ...d, cancellationRules: [...d.cancellationRules, rule] }));
            setEditing(null);
          }}
          onCancel={editing != null ? () => setEditing(null) : undefined}
        />
      </Section>
    </div>
  );
}

function AddCancellationForm({
  initial,
  onSubmit,
  onCancel,
}: {
  initial?: CancellationRuleDraft;
  onSubmit: (rule: CancellationRuleDraft) => void;
  onCancel?: () => void;
}) {
  const editing = initial !== undefined;
  const [tierName, setTierName] = useState(initial?.tierName ?? "");
  const [hours, setHours] = useState(String(initial?.timeBoundaryHours ?? 48));
  const [refund, setRefund] = useState(String(initial?.refundPercentage ?? 100));
  const [error, setError] = useState<string | null>(null);

  function submit() {
    const parsed = cancellationRuleSchema.safeParse({ tierName, timeBoundaryHours: Number(hours), refundPercentage: Number(refund) });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Datos inválidos.");
    onSubmit(parsed.data);
  }

  return (
    <AddCard editing={editing} title={editing ? "Editar política" : "Nueva política"}>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Nombre *">
          <Input value={tierName} onChange={(e) => setTierName(e.target.value)} placeholder="Flexible" onKeyDown={onEnter(submit)} autoFocus={editing} />
        </Field>
        <Field label="Horas antes *">
          <Input type="number" min={0} value={hours} onChange={(e) => setHours(e.target.value)} onKeyDown={onEnter(submit)} />
        </Field>
        <Field label="% reembolso *">
          <Input type="number" min={0} max={100} value={refund} onChange={(e) => setRefund(e.target.value)} onKeyDown={onEnter(submit)} />
        </Field>
      </div>
      {error && <p role="alert" className="text-xs text-[var(--destructive)]">{error}</p>}
      <FormActions editing={editing} onSubmit={submit} onCancel={onCancel} addLabel="Agregar política" />
    </AddCard>
  );
}

// --------------------------------------------------------------------------- //
// Step: review + submit                                                         //
// --------------------------------------------------------------------------- //
function ReviewStep({
  draft,
  readiness,
  sessionId,
  importToken,
  onSessionId,
  onImportToken,
  connectionValid,
  firstError,
  result,
  pending,
  canSubmit,
  onSubmit,
  onJump,
}: {
  draft: IntakeDraft;
  readiness: ReturnType<typeof computeReadiness>;
  sessionId: string;
  importToken: string;
  onSessionId: (v: string) => void;
  onImportToken: (v: string) => void;
  connectionValid: boolean;
  firstError: { area: ReadinessArea | null; message: string } | null;
  result: SubmitResult | null;
  pending: boolean;
  canSubmit: boolean;
  onSubmit: () => void;
  onJump: (i: number) => void;
}) {
  const records = useMemo(() => buildRecords(draft), [draft]);

  return (
    <Section title="Revisar y enviar" description="Confirma los datos antes de enviarlos al PMS.">
      <ReviewGroup label="Posada" onEdit={() => onJump(1)}>
        <p className="text-sm">
          <span className="font-medium">{draft.property.name || "—"}</span>
          {draft.property.address ? ` · ${draft.property.address}` : ""}
        </p>
      </ReviewGroup>

      <ReviewGroup label={`Tipos de habitación (${draft.roomTypes.length})`} onEdit={() => onJump(2)}>
        <ReviewLines lines={draft.roomTypes.map((rt) => `${rt.name} — ${rt.maxOccupancy} pax${rt.bedType ? `, ${BED_TYPE_LABELS[rt.bedType]}` : ""}`)} empty="Ninguno" />
      </ReviewGroup>

      <ReviewGroup label={`Habitaciones (${draft.rooms.length})`} onEdit={() => onJump(3)}>
        {draft.rooms.length === 0 ? <Muted>Ninguna</Muted> : <RoomsByType draft={draft} />}
      </ReviewGroup>

      <ReviewGroup label={`Tarifas (${draft.ratePlans.length})`} onEdit={() => onJump(4)}>
        <ReviewLines lines={draft.ratePlans.map((rp) => `${rp.roomTypeName} · ${rp.name || "standard"} — ${rp.baseRate} ${rp.currency}`)} empty="Ninguna" />
      </ReviewGroup>

      <ReviewGroup label="Pagos y políticas" onEdit={() => onJump(5)}>
        <ReviewLines
          lines={[
            draft.payment.methods.length ? `Pagos: ${draft.payment.methods.map((m) => PAYMENT_METHOD_LABELS[m]).join(", ")}` : "",
            ...draft.cancellationRules.map((cr) => `${cr.tierName}: ${cr.refundPercentage}% si ≥ ${cr.timeBoundaryHours}h`),
          ].filter(Boolean)}
          empty="Sin definir (opcional)"
        />
      </ReviewGroup>

      {/* Connection — editable here so a fresh token can be pasted right before sending. */}
      <div className="rounded-lg border border-[var(--border)] p-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">Conexión PMS</span>
          {connectionValid ? <span className="text-xs text-[var(--primary)]">lista</span> : <span className="text-xs text-[var(--muted-foreground)]">incompleta</span>}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="ID de sesión">
            <Input value={sessionId} onChange={(e) => onSessionId(e.target.value)} className="font-mono text-xs" spellCheck={false} />
          </Field>
          <Field label="Token" hint="Caduca a los 10 min. Pega uno fresco justo antes de enviar si tardaste.">
            <Input value={importToken} onChange={(e) => onImportToken(e.target.value)} className="font-mono text-xs" spellCheck={false} placeholder="eyJ..." />
          </Field>
        </div>
      </div>

      <div className="rounded-md bg-[var(--muted)] px-3 py-2 text-xs text-[var(--muted-foreground)]">
        Se enviarán <span className="font-medium text-[var(--foreground)]">{records.length}</span> registros.
      </div>

      {!connectionValid && (
        <Banner tone="warn">
          Falta el ID de sesión o el token.{" "}
          <button type="button" className="underline" onClick={() => onJump(0)}>
            Ir a la conexión
          </button>
          .
        </Banner>
      )}
      {connectionValid && firstError && (
        <Banner tone="warn">
          {firstError.message}.{" "}
          {firstError.area && (
            <button type="button" className="underline" onClick={() => onJump(AREA_STEP[firstError.area as ReadinessArea])}>
              Ir a corregir
            </button>
          )}
        </Banner>
      )}
      {connectionValid && !firstError && !readiness.ready && (
        <Banner tone="warn">
          Se puede enviar, pero faltan áreas para quedar listo para producción:{" "}
          {readiness.blocking.map((a, i) => (
            <span key={a}>
              {i > 0 ? ", " : ""}
              <button type="button" className="underline" onClick={() => onJump(AREA_STEP[a])}>
                {areaLabel(a)}
              </button>
            </span>
          ))}
          . Puedes completarlas en otro envío.
        </Banner>
      )}

      <div aria-live="polite">{result && <ResultBanner result={result} />}</div>

      <Button onClick={onSubmit} disabled={!canSubmit} loading={pending} loadingText="Enviando…">
        <Send className="h-4 w-4" /> Enviar al PMS
      </Button>
    </Section>
  );
}

function RoomsByType({ draft }: { draft: IntakeDraft }) {
  const byType = new Map<string, string[]>();
  for (const r of draft.rooms) {
    const arr = byType.get(r.roomTypeName) ?? [];
    arr.push(r.roomNumber);
    byType.set(r.roomTypeName, arr);
  }
  return (
    <ul className="space-y-1 text-sm">
      {[...byType.entries()].map(([type, nums]) => (
        <li key={type}>
          <span className="text-[var(--muted-foreground)]">{type}:</span> {nums.join(", ")}
        </li>
      ))}
    </ul>
  );
}

function ReviewGroup({ label, onEdit, children }: { label: string; onEdit: () => void; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-[var(--border)] p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">{label}</span>
        <button type="button" onClick={onEdit} className="inline-flex items-center gap-1 text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
          <Pencil className="h-3 w-3" /> Editar
        </button>
      </div>
      {children}
    </div>
  );
}

function ReviewLines({ lines, empty }: { lines: string[]; empty: string }) {
  if (lines.length === 0) return <Muted>{empty}</Muted>;
  return (
    <ul className="space-y-0.5 text-sm">
      {lines.map((l, i) => (
        <li key={i}>{l}</li>
      ))}
    </ul>
  );
}

function Muted({ children }: { children: ReactNode }) {
  return <p className="text-sm text-[var(--muted-foreground)]">{children}</p>;
}

function ResultBanner({ result }: { result: SubmitResult }) {
  if (result.ok) {
    return (
      <Banner tone="ok">
        {result.created
          ? `Intake enviado: ${result.recordCount} registros recibidos por el PMS.`
          : `Reenvío idempotente: el PMS ya tenía esta revisión (sin cambios).`}{" "}
        <span className="font-mono text-xs">rev {result.revision}</span>
      </Banner>
    );
  }
  return <Banner tone="error">{result.message}</Banner>;
}

// --------------------------------------------------------------------------- //
// Shared bits                                                                   //
// --------------------------------------------------------------------------- //
function onEnter(fn: () => void) {
  return (e: { key: string; preventDefault: () => void }) => {
    if (e.key === "Enter") {
      e.preventDefault();
      fn();
    }
  };
}

function Segmented({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: Array<{ value: string; label: string }> }) {
  return (
    <div className="inline-flex rounded-md border border-[var(--border)] p-0.5 text-xs">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn("rounded px-3 py-1 transition-colors", value === o.value ? "bg-[var(--primary)] text-[var(--primary-foreground)]" : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function FormActions({ editing, onSubmit, onCancel, addLabel }: { editing: boolean; onSubmit: () => void; onCancel?: () => void; addLabel: string }) {
  return (
    <div className="flex items-center gap-2">
      <Button type="button" variant={editing ? "default" : "outline"} size="sm" onClick={onSubmit}>
        {editing ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />} {editing ? "Guardar cambios" : addLabel}
      </Button>
      {onCancel && (
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          <X className="h-4 w-4" /> Cancelar
        </Button>
      )}
    </div>
  );
}

function AddCard({ editing, title, children }: { editing?: boolean; title: string; children: ReactNode }) {
  return (
    <div className={cn("space-y-3 rounded-lg border p-4", editing ? "border-[var(--primary)] bg-[var(--primary)]/5" : "border-dashed border-[var(--border)]")}>
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">{title}</p>
      {children}
    </div>
  );
}

function EmptyDependency({ onJump }: { onJump: () => void }) {
  return (
    <div className="rounded-lg border border-dashed border-[var(--border)] px-4 py-6 text-center">
      <p className="text-sm text-[var(--muted-foreground)]">Primero define al menos un tipo de habitación.</p>
      <Button type="button" variant="outline" size="sm" className="mt-3" onClick={onJump}>
        <Tag className="h-4 w-4" /> Ir a tipos de habitación
      </Button>
    </div>
  );
}

function ItemList({
  items,
  onRemove,
  onEdit,
  activeIndex,
  emptyText,
  confirmRemove,
  onConfirmRemove,
}: {
  items: Array<{ title: string; meta?: string }>;
  onRemove: (i: number) => void;
  onEdit?: (i: number) => void;
  activeIndex?: number | null;
  emptyText: string;
  confirmRemove?: (i: number) => string | null;
  onConfirmRemove?: (i: number) => void;
}) {
  const [confirming, setConfirming] = useState<number | null>(null);
  if (items.length === 0) return <p className="text-sm text-[var(--muted-foreground)]">{emptyText}</p>;
  return (
    <ul className="space-y-2">
      {items.map((it, i) => {
        const warn = confirming === i ? confirmRemove?.(i) ?? null : null;
        return (
          <li key={i} className={cn("rounded-md border px-3 py-2 text-sm", activeIndex === i ? "border-[var(--primary)] bg-[var(--primary)]/5" : "border-[var(--border)]")}>
            <div className="flex items-center justify-between">
              <span>
                <span className="font-medium">{it.title}</span>
                {it.meta && <span className="ml-2 text-xs text-[var(--muted-foreground)]">{it.meta}</span>}
              </span>
              <span className="flex items-center gap-1">
                {onEdit && (
                  <button type="button" onClick={() => onEdit(i)} className="rounded p-1 text-[var(--muted-foreground)] hover:text-[var(--foreground)]" aria-label="Editar">
                    <Pencil className="h-4 w-4" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    const msg = confirmRemove?.(i) ?? null;
                    if (msg) setConfirming(i);
                    else onRemove(i);
                  }}
                  className="rounded p-1 text-[var(--muted-foreground)] hover:text-[var(--destructive)]"
                  aria-label="Quitar"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </span>
            </div>
            {warn && (
              <div role="alert" className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-xs text-amber-700 dark:text-amber-400">
                <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
                <span>{warn}</span>
                <span className="ml-auto flex gap-2">
                  <button type="button" className="font-medium underline" onClick={() => { onConfirmRemove?.(i); setConfirming(null); }}>
                    Quitar de todos modos
                  </button>
                  <button type="button" className="underline" onClick={() => setConfirming(null)}>
                    Cancelar
                  </button>
                </span>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Banner({ tone, children }: { tone: "ok" | "warn" | "error"; children: ReactNode }) {
  const cls =
    tone === "ok"
      ? "border-[var(--primary)]/30 bg-[var(--primary)]/10 text-[var(--primary)]"
      : tone === "warn"
        ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400"
        : "border-[var(--destructive)]/30 bg-[var(--destructive)]/10 text-[var(--destructive)]";
  return <div className={cn("rounded-md border px-3 py-2 text-sm", cls)}>{children}</div>;
}

function StepFooter({
  step,
  lastStep,
  onBack,
  onNext,
  nextDisabled,
  hasContent,
  onClear,
}: {
  step: number;
  lastStep: number;
  onBack: () => void;
  onNext: () => void;
  nextDisabled: boolean;
  hasContent: boolean;
  onClear: () => void;
}) {
  const [confirmClear, setConfirmClear] = useState(false);
  return (
    <div className="flex items-center justify-between gap-2 border-t border-[var(--border)] pt-4">
      <Button type="button" variant="ghost" onClick={onBack} disabled={step === 0}>
        <ChevronLeft className="h-4 w-4" /> Atrás
      </Button>

      <div className="flex items-center gap-2">
        {hasContent &&
          (confirmClear ? (
            <span className="flex items-center gap-1 text-xs text-[var(--muted-foreground)]">
              ¿Borrar todo?
              <button type="button" className="font-medium text-[var(--destructive)] underline" onClick={() => { onClear(); setConfirmClear(false); }}>
                Sí
              </button>
              <button type="button" className="underline" onClick={() => setConfirmClear(false)}>
                No
              </button>
            </span>
          ) : (
            <button type="button" onClick={() => setConfirmClear(true)} className="inline-flex items-center gap-1 text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)]" title="Borrador guardado automáticamente">
              <RotateCcw className="h-3.5 w-3.5" /> Limpiar
            </button>
          ))}
        {step < lastStep ? (
          <Button type="button" variant="outline" onClick={onNext} disabled={nextDisabled}>
            Siguiente <ChevronRight className="h-4 w-4" />
          </Button>
        ) : (
          <span className="text-xs text-[var(--muted-foreground)]">Último paso</span>
        )}
      </div>
    </div>
  );
}
