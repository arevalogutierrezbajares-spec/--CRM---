"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
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
  Plus,
  Send,
  Tag,
  Trash2,
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
  AMENITY_LABELS,
  BED_TYPE_LABELS,
  CANONICAL_AMENITIES,
  CANONICAL_BED_TYPES,
  CANONICAL_CURRENCIES,
  CURRENCY_LABELS,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  type CanonicalAmenity,
  type CanonicalBedType,
  type CanonicalCurrency,
  type IntakeDraft,
  areaLabel,
  buildRecords,
  cancellationRuleSchema,
  computeReadiness,
  emptyDraft,
  intakeDraftSchema,
  ratePlanSchema,
  roomSchema,
  roomTypeSchema,
  type PaymentMethod,
} from "@/lib/onboarding/intake-contract";
import { submitIntake, type SubmitResult } from "@/app/(app)/posada-onboarding/actions";

const SESSION_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const STEPS = [
  { key: "connect", label: "Conexión", icon: KeyRound },
  { key: "property", label: "Posada", icon: Building2 },
  { key: "roomTypes", label: "Tipos", icon: Tag },
  { key: "rooms", label: "Habitaciones", icon: DoorOpen },
  { key: "ratePlans", label: "Tarifas", icon: CreditCard },
  { key: "policies", label: "Pagos y políticas", icon: CreditCard },
  { key: "review", label: "Revisar", icon: Send },
] as const;

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

  const readiness = useMemo(() => computeReadiness(draft), [draft]);
  const roomTypeNames = useMemo(
    () => draft.roomTypes.map((rt) => rt.name.trim()).filter(Boolean),
    [draft.roomTypes],
  );
  const draftValid = useMemo(() => intakeDraftSchema.safeParse(draft).success, [draft]);
  const connectionValid = SESSION_ID_RE.test(sessionId.trim()) && importToken.trim().length > 0;
  const canSubmit = connectionValid && draftValid && !pending;

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

  return (
    <div className="space-y-6">
      <Stepper step={step} onJump={setStep} />

      <ReadinessStrip readiness={readiness} />

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

      {step === 2 && (
        <RoomTypesStep
          draft={draft}
          onAdd={(rt) => setDraft((d) => ({ ...d, roomTypes: [...d.roomTypes, rt] }))}
          onRemove={(i) =>
            setDraft((d) => ({ ...d, roomTypes: d.roomTypes.filter((_, idx) => idx !== i) }))
          }
        />
      )}

      {step === 3 && (
        <RoomsStep
          draft={draft}
          roomTypeNames={roomTypeNames}
          onAdd={(room) => setDraft((d) => ({ ...d, rooms: [...d.rooms, room] }))}
          onRemove={(i) =>
            setDraft((d) => ({ ...d, rooms: d.rooms.filter((_, idx) => idx !== i) }))
          }
        />
      )}

      {step === 4 && (
        <RatePlansStep
          draft={draft}
          roomTypeNames={roomTypeNames}
          onAdd={(rp) => setDraft((d) => ({ ...d, ratePlans: [...d.ratePlans, rp] }))}
          onRemove={(i) =>
            setDraft((d) => ({ ...d, ratePlans: d.ratePlans.filter((_, idx) => idx !== i) }))
          }
        />
      )}

      {step === 5 && (
        <PoliciesStep
          draft={draft}
          onTogglePayment={(m) =>
            setDraft((d) => {
              const has = d.payment.methods.includes(m);
              return {
                ...d,
                payment: {
                  methods: has
                    ? d.payment.methods.filter((x) => x !== m)
                    : [...d.payment.methods, m],
                },
              };
            })
          }
          onAddRule={(rule) =>
            setDraft((d) => ({ ...d, cancellationRules: [...d.cancellationRules, rule] }))
          }
          onRemoveRule={(i) =>
            setDraft((d) => ({
              ...d,
              cancellationRules: d.cancellationRules.filter((_, idx) => idx !== i),
            }))
          }
        />
      )}

      {step === 6 && (
        <ReviewStep
          draft={draft}
          readiness={readiness}
          sessionId={sessionId.trim()}
          connectionValid={connectionValid}
          draftValid={draftValid}
          result={result}
          pending={pending}
          canSubmit={canSubmit}
          onSubmit={onSubmit}
          onGoToConnection={() => setStep(0)}
        />
      )}

      <StepFooter
        step={step}
        lastStep={STEPS.length - 1}
        onBack={() => setStep((s) => Math.max(0, s - 1))}
        onNext={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
        nextDisabled={step === 0 && !connectionValid}
      />
    </div>
  );
}

// --------------------------------------------------------------------------- //
// Stepper + readiness                                                           //
// --------------------------------------------------------------------------- //
function Stepper({ step, onJump }: { step: number; onJump: (i: number) => void }) {
  return (
    <ol className="flex flex-wrap items-center gap-1 text-xs">
      {STEPS.map((s, i) => {
        const Icon = s.icon;
        const active = i === step;
        const done = i < step;
        return (
          <li key={s.key}>
            <button
              type="button"
              onClick={() => onJump(i)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 transition-colors",
                active
                  ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)]"
                  : "border-[var(--border)] text-[var(--muted-foreground)] hover:bg-[var(--accent)]",
              )}
            >
              {done ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
              <span>{s.label}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function ReadinessStrip({ readiness }: { readiness: ReturnType<typeof computeReadiness> }) {
  const areas = Object.keys(readiness.areas) as Array<keyof typeof readiness.areas>;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-xs">
      <span className="font-medium text-[var(--muted-foreground)]">Listo para producción:</span>
      {areas.map((a) => {
        const ok = readiness.areas[a];
        return (
          <span
            key={a}
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5",
              ok
                ? "bg-[var(--primary)]/10 text-[var(--primary)]"
                : "bg-[var(--muted)] text-[var(--muted-foreground)]",
            )}
          >
            {ok ? <CheckCircle2 className="h-3 w-3" /> : <CircleDashed className="h-3 w-3" />}
            {areaLabel(a)}
          </span>
        );
      })}
    </div>
  );
}

// --------------------------------------------------------------------------- //
// Step bodies                                                                   //
// --------------------------------------------------------------------------- //
function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      {description && <p className="mt-1 text-sm text-[var(--muted-foreground)]">{description}</p>}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {hint && <p className="text-xs text-[var(--muted-foreground)]">{hint}</p>}
    </div>
  );
}

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
      description="Pega el ID de sesión y el token de importación de la consola del PMS, o abre esta página con el enlace que la consola genera."
    >
      {prefilled && (
        <Banner tone="ok">Datos recibidos por enlace. Verifícalos antes de continuar.</Banner>
      )}
      <Field label="ID de sesión" hint="UUID de la sesión de onboarding del PMS.">
        <Input
          value={sessionId}
          onChange={(e) => onSessionId(e.target.value)}
          placeholder="00000000-0000-0000-0000-000000000000"
          spellCheck={false}
          aria-invalid={!idLooksValid}
        />
      </Field>
      {!idLooksValid && (
        <p className="text-xs text-[var(--destructive)]">El ID de sesión debe ser un UUID válido.</p>
      )}
      <Field
        label="Token de importación"
        hint="Caduca a los 10 minutos. Si expira, pide uno nuevo en el PMS y pégalo aquí."
      >
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

function PropertyStep({
  draft,
  onChange,
}: {
  draft: IntakeDraft;
  onChange: (property: IntakeDraft["property"]) => void;
}) {
  return (
    <Section title="Datos de la posada" description="El nombre es obligatorio. Dirección y zona horaria son opcionales.">
      <Field label="Nombre de la posada *">
        <Input
          value={draft.property.name}
          onChange={(e) => onChange({ ...draft.property, name: e.target.value })}
          placeholder="Posada Bolívar"
        />
      </Field>
      <Field label="Dirección">
        <Input
          value={draft.property.address ?? ""}
          onChange={(e) => onChange({ ...draft.property, address: e.target.value })}
          placeholder="Calle, sector, estado"
        />
      </Field>
      <Field label="Zona horaria" hint="Por defecto America/Caracas.">
        <Input
          value={draft.property.timezone ?? ""}
          onChange={(e) => onChange({ ...draft.property, timezone: e.target.value })}
          placeholder="America/Caracas"
        />
      </Field>
    </Section>
  );
}

function RoomTypesStep({
  draft,
  onAdd,
  onRemove,
}: {
  draft: IntakeDraft;
  onAdd: (rt: IntakeDraft["roomTypes"][number]) => void;
  onRemove: (i: number) => void;
}) {
  return (
    <Section
      title="Tipos de habitación"
      description="Define cada tipo (p. ej. Doble, Suite). Las habitaciones y tarifas se asignan a un tipo."
    >
      <ItemList
        items={draft.roomTypes.map((rt) => ({
          title: rt.name,
          meta: `${rt.maxOccupancy} pax${rt.bedType ? ` · ${BED_TYPE_LABELS[rt.bedType]}` : ""}${
            rt.amenities.length ? ` · ${rt.amenities.length} amenidades` : ""
          }`,
        }))}
        onRemove={onRemove}
        emptyText="Aún no hay tipos de habitación."
      />
      <AddRoomTypeForm
        existingNames={draft.roomTypes.map((rt) => rt.name.trim())}
        onAdd={onAdd}
      />
    </Section>
  );
}

function RoomsStep({
  draft,
  roomTypeNames,
  onAdd,
  onRemove,
}: {
  draft: IntakeDraft;
  roomTypeNames: string[];
  onAdd: (room: IntakeDraft["rooms"][number]) => void;
  onRemove: (i: number) => void;
}) {
  return (
    <Section title="Habitaciones" description="Cada habitación se asigna a un tipo definido antes.">
      {roomTypeNames.length === 0 ? (
        <Banner tone="warn">Primero define al menos un tipo de habitación.</Banner>
      ) : (
        <>
          <ItemList
            items={draft.rooms.map((r) => ({ title: `Hab. ${r.roomNumber}`, meta: r.roomTypeName }))}
            onRemove={onRemove}
            emptyText="Aún no hay habitaciones."
          />
          <AddRoomForm roomTypeNames={roomTypeNames} onAdd={onAdd} />
        </>
      )}
    </Section>
  );
}

function RatePlansStep({
  draft,
  roomTypeNames,
  onAdd,
  onRemove,
}: {
  draft: IntakeDraft;
  roomTypeNames: string[];
  onAdd: (rp: IntakeDraft["ratePlans"][number]) => void;
  onRemove: (i: number) => void;
}) {
  return (
    <Section title="Tarifas" description="Tarifa base por tipo de habitación y moneda.">
      {roomTypeNames.length === 0 ? (
        <Banner tone="warn">Primero define al menos un tipo de habitación.</Banner>
      ) : (
        <>
          <ItemList
            items={draft.ratePlans.map((rp) => ({
              title: `${rp.roomTypeName} · ${rp.name || "standard"}`,
              meta: `${rp.baseRate} ${rp.currency}`,
            }))}
            onRemove={onRemove}
            emptyText="Aún no hay tarifas."
          />
          <AddRatePlanForm roomTypeNames={roomTypeNames} onAdd={onAdd} />
        </>
      )}
    </Section>
  );
}

function PoliciesStep({
  draft,
  onTogglePayment,
  onAddRule,
  onRemoveRule,
}: {
  draft: IntakeDraft;
  onTogglePayment: (m: PaymentMethod) => void;
  onAddRule: (rule: IntakeDraft["cancellationRules"][number]) => void;
  onRemoveRule: (i: number) => void;
}) {
  return (
    <div className="space-y-6">
      <Section title="Métodos de pago" description="Opcional. Selecciona los que acepta la posada.">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {PAYMENT_METHODS.map((m) => {
            const checked = draft.payment.methods.includes(m);
            return (
              <label
                key={m}
                className="flex cursor-pointer items-center gap-2 rounded-md border border-[var(--border)] px-3 py-2 text-sm hover:bg-[var(--accent)]"
              >
                <Checkbox checked={checked} onCheckedChange={() => onTogglePayment(m)} />
                {PAYMENT_METHOD_LABELS[m]}
              </label>
            );
          })}
        </div>
      </Section>

      <Section title="Políticas de cancelación" description="Opcional. Define tramos de reembolso.">
        <ItemList
          items={draft.cancellationRules.map((cr) => ({
            title: cr.tierName,
            meta: `${cr.refundPercentage}% si cancela ≥ ${cr.timeBoundaryHours}h antes`,
          }))}
          onRemove={onRemoveRule}
          emptyText="Aún no hay políticas."
        />
        <AddCancellationForm onAdd={onAddRule} />
      </Section>
    </div>
  );
}

// --------------------------------------------------------------------------- //
// Review + submit                                                               //
// --------------------------------------------------------------------------- //
function ReviewStep({
  draft,
  readiness,
  sessionId,
  connectionValid,
  draftValid,
  result,
  pending,
  canSubmit,
  onSubmit,
  onGoToConnection,
}: {
  draft: IntakeDraft;
  readiness: ReturnType<typeof computeReadiness>;
  sessionId: string;
  connectionValid: boolean;
  draftValid: boolean;
  result: SubmitResult | null;
  pending: boolean;
  canSubmit: boolean;
  onSubmit: () => void;
  onGoToConnection: () => void;
}) {
  const records = useMemo(() => buildRecords(draft), [draft]);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of records) c[r.type] = (c[r.type] ?? 0) + 1;
    return c;
  }, [records]);

  return (
    <Section title="Revisar y enviar" description="Se enviarán los siguientes registros al PMS.">
      <div className="grid gap-2 sm:grid-cols-2">
        <SummaryRow label="Perfil de posada" value={counts.property_profile ?? 0} />
        <SummaryRow label="Tipos de habitación" value={counts.room_type ?? 0} />
        <SummaryRow label="Habitaciones" value={counts.room ?? 0} />
        <SummaryRow label="Tarifas" value={counts.rate_plan ?? 0} />
        <SummaryRow label="Políticas de cancelación" value={counts.cancellation_rule ?? 0} />
        <SummaryRow label="Config. de pago" value={counts.payment_config ?? 0} />
      </div>

      <div className="rounded-md bg-[var(--muted)] px-3 py-2 text-xs text-[var(--muted-foreground)]">
        Total: <span className="font-medium text-[var(--foreground)]">{records.length}</span> registros · sesión{" "}
        <span className="font-mono">{sessionId || "—"}</span>
      </div>

      {!connectionValid && (
        <Banner tone="warn">
          Falta el ID de sesión o el token.{" "}
          <button type="button" className="underline" onClick={onGoToConnection}>
            Volver a la conexión
          </button>
          .
        </Banner>
      )}
      {connectionValid && !draftValid && (
        <Banner tone="warn">Hay datos inválidos. Revisa los pasos anteriores.</Banner>
      )}
      {connectionValid && draftValid && !readiness.ready && (
        <Banner tone="warn">
          Se puede enviar, pero faltan áreas para que el PMS quede listo para producción:{" "}
          {readiness.blocking.map(areaLabel).join(", ")}. Puedes completarlas en otro envío.
        </Banner>
      )}

      {result && <ResultBanner result={result} />}

      <Button onClick={onSubmit} disabled={!canSubmit} loading={pending} loadingText="Enviando…">
        <Send className="h-4 w-4" /> Enviar al PMS
      </Button>
    </Section>
  );
}

function SummaryRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-[var(--border)] px-3 py-2 text-sm">
      <span className="text-[var(--muted-foreground)]">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
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
// Add-forms (local state, validated against the section schema)                 //
// --------------------------------------------------------------------------- //
function AddRoomTypeForm({
  existingNames,
  onAdd,
}: {
  existingNames: string[];
  onAdd: (rt: IntakeDraft["roomTypes"][number]) => void;
}) {
  const [name, setName] = useState("");
  const [occupancy, setOccupancy] = useState("2");
  const [bedType, setBedType] = useState<CanonicalBedType | "none">("none");
  const [amenities, setAmenities] = useState<CanonicalAmenity[]>([]);
  const [error, setError] = useState<string | null>(null);

  function toggleAmenity(a: CanonicalAmenity) {
    setAmenities((prev) => (prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]));
  }

  function add() {
    if (existingNames.includes(name.trim())) {
      setError("Ya existe un tipo con ese nombre.");
      return;
    }
    const parsed = roomTypeSchema.safeParse({
      name,
      maxOccupancy: Number(occupancy),
      bedType: bedType === "none" ? null : bedType,
      amenities,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Datos inválidos.");
      return;
    }
    onAdd(parsed.data);
    setName("");
    setOccupancy("2");
    setBedType("none");
    setAmenities([]);
    setError(null);
  }

  return (
    <AddCard>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nombre del tipo *">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Habitación Doble" />
        </Field>
        <Field label="Capacidad (pax) *">
          <Input
            type="number"
            min={1}
            value={occupancy}
            onChange={(e) => setOccupancy(e.target.value)}
          />
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
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {CANONICAL_AMENITIES.map((a) => (
            <label
              key={a}
              className="flex cursor-pointer items-center gap-2 rounded-md border border-[var(--border)] px-2 py-1.5 text-xs hover:bg-[var(--accent)]"
            >
              <Checkbox checked={amenities.includes(a)} onCheckedChange={() => toggleAmenity(a)} />
              {AMENITY_LABELS[a]}
            </label>
          ))}
        </div>
      </Field>
      {error && <p className="text-xs text-[var(--destructive)]">{error}</p>}
      <Button type="button" variant="outline" size="sm" onClick={add}>
        <Plus className="h-4 w-4" /> Agregar tipo
      </Button>
    </AddCard>
  );
}

function AddRoomForm({
  roomTypeNames,
  onAdd,
}: {
  roomTypeNames: string[];
  onAdd: (room: IntakeDraft["rooms"][number]) => void;
}) {
  const [roomNumber, setRoomNumber] = useState("");
  const [roomTypeName, setRoomTypeName] = useState(roomTypeNames[0] ?? "");
  const [error, setError] = useState<string | null>(null);

  function add() {
    const parsed = roomSchema.safeParse({ roomNumber, roomTypeName });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Datos inválidos.");
      return;
    }
    if (!roomTypeNames.includes(parsed.data.roomTypeName)) {
      setError("Selecciona un tipo de habitación válido.");
      return;
    }
    onAdd(parsed.data);
    setRoomNumber("");
    setError(null);
  }

  return (
    <AddCard>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Número / nombre *">
          <Input value={roomNumber} onChange={(e) => setRoomNumber(e.target.value)} placeholder="101" />
        </Field>
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
      {error && <p className="text-xs text-[var(--destructive)]">{error}</p>}
      <Button type="button" variant="outline" size="sm" onClick={add}>
        <Plus className="h-4 w-4" /> Agregar habitación
      </Button>
    </AddCard>
  );
}

function AddRatePlanForm({
  roomTypeNames,
  onAdd,
}: {
  roomTypeNames: string[];
  onAdd: (rp: IntakeDraft["ratePlans"][number]) => void;
}) {
  const [roomTypeName, setRoomTypeName] = useState(roomTypeNames[0] ?? "");
  const [name, setName] = useState("standard");
  const [baseRate, setBaseRate] = useState("");
  const [currency, setCurrency] = useState<CanonicalCurrency>("USD");
  const [error, setError] = useState<string | null>(null);

  function add() {
    const parsed = ratePlanSchema.safeParse({
      roomTypeName,
      name,
      baseRate: Number(baseRate),
      currency,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Datos inválidos.");
      return;
    }
    if (!roomTypeNames.includes(parsed.data.roomTypeName)) {
      setError("Selecciona un tipo de habitación válido.");
      return;
    }
    onAdd(parsed.data);
    setName("standard");
    setBaseRate("");
    setError(null);
  }

  return (
    <AddCard>
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
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="standard" />
        </Field>
        <Field label="Tarifa base *">
          <Input
            type="number"
            min={0}
            step="0.01"
            value={baseRate}
            onChange={(e) => setBaseRate(e.target.value)}
            placeholder="45"
          />
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
      {error && <p className="text-xs text-[var(--destructive)]">{error}</p>}
      <Button type="button" variant="outline" size="sm" onClick={add}>
        <Plus className="h-4 w-4" /> Agregar tarifa
      </Button>
    </AddCard>
  );
}

function AddCancellationForm({
  onAdd,
}: {
  onAdd: (rule: IntakeDraft["cancellationRules"][number]) => void;
}) {
  const [tierName, setTierName] = useState("");
  const [hours, setHours] = useState("48");
  const [refund, setRefund] = useState("100");
  const [error, setError] = useState<string | null>(null);

  function add() {
    const parsed = cancellationRuleSchema.safeParse({
      tierName,
      timeBoundaryHours: Number(hours),
      refundPercentage: Number(refund),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Datos inválidos.");
      return;
    }
    onAdd(parsed.data);
    setTierName("");
    setHours("48");
    setRefund("100");
    setError(null);
  }

  return (
    <AddCard>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Nombre *">
          <Input value={tierName} onChange={(e) => setTierName(e.target.value)} placeholder="Flexible" />
        </Field>
        <Field label="Horas antes *">
          <Input type="number" min={0} value={hours} onChange={(e) => setHours(e.target.value)} />
        </Field>
        <Field label="% reembolso *">
          <Input type="number" min={0} max={100} value={refund} onChange={(e) => setRefund(e.target.value)} />
        </Field>
      </div>
      {error && <p className="text-xs text-[var(--destructive)]">{error}</p>}
      <Button type="button" variant="outline" size="sm" onClick={add}>
        <Plus className="h-4 w-4" /> Agregar política
      </Button>
    </AddCard>
  );
}

// --------------------------------------------------------------------------- //
// Small shared bits                                                             //
// --------------------------------------------------------------------------- //
function AddCard({ children }: { children: ReactNode }) {
  return <div className="space-y-3 rounded-lg border border-dashed border-[var(--border)] p-4">{children}</div>;
}

function ItemList({
  items,
  onRemove,
  emptyText,
}: {
  items: Array<{ title: string; meta?: string }>;
  onRemove: (i: number) => void;
  emptyText: string;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-[var(--muted-foreground)]">{emptyText}</p>;
  }
  return (
    <ul className="space-y-2">
      {items.map((it, i) => (
        <li
          key={i}
          className="flex items-center justify-between rounded-md border border-[var(--border)] px-3 py-2 text-sm"
        >
          <span>
            <span className="font-medium">{it.title}</span>
            {it.meta && <span className="ml-2 text-xs text-[var(--muted-foreground)]">{it.meta}</span>}
          </span>
          <button
            type="button"
            onClick={() => onRemove(i)}
            className="text-[var(--muted-foreground)] hover:text-[var(--destructive)]"
            aria-label="Quitar"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </li>
      ))}
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
}: {
  step: number;
  lastStep: number;
  onBack: () => void;
  onNext: () => void;
  nextDisabled: boolean;
}) {
  return (
    <div className="flex items-center justify-between border-t border-[var(--border)] pt-4">
      <Button type="button" variant="ghost" onClick={onBack} disabled={step === 0}>
        <ChevronLeft className="h-4 w-4" /> Atrás
      </Button>
      {step < lastStep ? (
        <Button type="button" variant="outline" onClick={onNext} disabled={nextDisabled}>
          Siguiente <ChevronRight className="h-4 w-4" />
        </Button>
      ) : (
        <span className="text-xs text-[var(--muted-foreground)]">Último paso</span>
      )}
    </div>
  );
}
