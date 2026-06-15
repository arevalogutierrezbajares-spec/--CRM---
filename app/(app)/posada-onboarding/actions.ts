"use server";

/**
 * Server action: push posada intake to the TOUR PMS onboarding import endpoint.
 *
 * The import token is a short-lived (10 min) bearer minted by the PMS operator
 * console. We forward server-side so (a) the token never has to make a
 * cross-origin browser request (CORS), and (b) it is never embedded in a client
 * network call to a third-party origin. The token is treated as a secret — never
 * logged, never persisted.
 */

import { requireUser } from "@/lib/current-user";
import {
  buildIntakeFields,
  computeIntakeRevision,
  intakeDraftSchema,
  SESSION_ID_RE,
  type IntakeDraft,
} from "@/lib/onboarding/intake-contract";

const PMS_TIMEOUT_MS = 12000;

export type SubmitErrorCode =
  | "not_configured" // CANEY_PMS_API_URL unset
  | "invalid_input" // bad session id / token / draft failed validation
  | "token_missing" // PMS 401
  | "token_rejected" // PMS 403 — expired, wrong scope, or cross-tenant
  | "not_enabled" // PMS 404 — onboarding dark, or session missing/expired link
  | "bad_request" // PMS 400
  | "upstream_error" // PMS 5xx
  | "unreachable"; // network error / timeout

export type SubmitResult =
  | {
      ok: true;
      created: boolean; // false = idempotent replay (PMS already had this revision)
      artifactId: string;
      revision: string;
      recordCount: number;
    }
  | { ok: false; code: SubmitErrorCode; message: string; status?: number };

export interface SubmitIntakeInput {
  sessionId: string;
  importToken: string;
  draft: IntakeDraft;
}

function pmsBaseUrl(): string | null {
  const raw = process.env.CANEY_PMS_API_URL?.trim();
  if (!raw) return null;
  return raw.replace(/\/+$/, "");
}

export async function submitIntake(input: SubmitIntakeInput): Promise<SubmitResult> {
  // Only authenticated CRM operators can push intake.
  await requireUser();

  const sessionId = input.sessionId?.trim() ?? "";
  const importToken = input.importToken?.trim() ?? "";

  if (!SESSION_ID_RE.test(sessionId)) {
    return { ok: false, code: "invalid_input", message: "ID de sesión inválido (se espera un UUID del PMS)." };
  }
  if (!importToken) {
    return { ok: false, code: "invalid_input", message: "Falta el token de importación del PMS." };
  }

  const parsed = intakeDraftSchema.safeParse(input.draft);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      ok: false,
      code: "invalid_input",
      message: first ? `${first.path.join(".")}: ${first.message}` : "Datos de intake inválidos.",
    };
  }

  const base = pmsBaseUrl();
  if (!base) {
    return {
      ok: false,
      code: "not_configured",
      message: "CANEY_PMS_API_URL no está configurada en este entorno.",
    };
  }

  const fields = buildIntakeFields(parsed.data);
  const revision = computeIntakeRevision(fields);
  const url = `${base}/api/v1/onboarding/sessions/${sessionId}/intake`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      cache: "no-store",
      redirect: "follow",
      signal: AbortSignal.timeout(PMS_TIMEOUT_MS),
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${importToken}`,
      },
      body: JSON.stringify({ intake_revision: revision, fields }),
    });
  } catch (err) {
    const timedOut = err instanceof Error && err.name === "TimeoutError";
    return {
      ok: false,
      code: "unreachable",
      message: timedOut
        ? `El PMS no respondió en ${PMS_TIMEOUT_MS / 1000}s.`
        : "No se pudo contactar al PMS.",
    };
  }

  if (res.ok) {
    const view = (await res.json().catch(() => ({}))) as {
      id?: string;
      created?: boolean;
    };
    return {
      ok: true,
      created: view.created ?? true,
      artifactId: view.id ?? "",
      revision,
      recordCount: fields.records.length,
    };
  }

  // Surface the PMS detail when present, but keep operator-friendly messages.
  const detail = await res.text().catch(() => "");
  const tail = detail ? ` (${detail.slice(0, 200)})` : "";

  switch (res.status) {
    case 400:
      return { ok: false, code: "bad_request", status: 400, message: `El PMS rechazó el intake.${tail}` };
    case 401:
      return {
        ok: false,
        code: "token_missing",
        status: 401,
        message: "El PMS no recibió el token de importación.",
      };
    case 403:
      return {
        ok: false,
        code: "token_rejected",
        status: 403,
        message:
          "El token de importación fue rechazado: expiró (válido 10 min), tiene el alcance equivocado, o no corresponde a esta sesión. Pide un token nuevo en el PMS.",
      };
    case 404:
      return {
        ok: false,
        code: "not_enabled",
        status: 404,
        message:
          "Onboarding no está habilitado en el PMS, o la sesión no existe / el enlace expiró.",
      };
    default:
      if (res.status >= 500) {
        return { ok: false, code: "upstream_error", status: res.status, message: `Error del PMS (HTTP ${res.status}).${tail}` };
      }
      return { ok: false, code: "bad_request", status: res.status, message: `Respuesta inesperada del PMS (HTTP ${res.status}).${tail}` };
  }
}
