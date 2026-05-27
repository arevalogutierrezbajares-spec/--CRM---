/**
 * FX conversion helper. Stores daily mid-market rates in fin_fx_rates and
 * converts arbitrary-currency amounts to USD cents.
 *
 * Rate storage:  rate_usd_per_million = (USD per 1 unit of currency) × 1_000_000
 *                so VES at 0.000028 USD/VES → rate_usd_per_million = 28
 *                and USD always has rate_usd_per_million = 1_000_000.
 *
 * Conversion:    usd_cents = round(amount_cents × rate_usd_per_million / 1_000_000)
 *
 * No external API yet — rates are user-set or default to 1.0 for USD.
 */

import { and, desc, eq, lte } from "drizzle-orm";
import { db, schema } from "@/db";

const { finFxRates } = schema;

const MICRO = 1_000_000;

export type CurrencyCode = string; // ISO 4217 e.g. USD, VES, EUR, COP

/** Convert an amount in `currency` (cents) to USD cents using the most recent
 *  rate on or before `onDate`. Falls back to 1:1 for USD; returns null if no
 *  rate is known for non-USD currencies. */
export async function toUsdCents(
  amountCents: number,
  currency: CurrencyCode,
  onDate: Date = new Date(),
): Promise<number | null> {
  if (currency === "USD") return amountCents;
  const dateISO = onDate.toISOString().slice(0, 10);
  const [row] = await db
    .select({ rate: finFxRates.rateUsd })
    .from(finFxRates)
    .where(and(eq(finFxRates.currency, currency), lte(finFxRates.rateDate, dateISO)))
    .orderBy(desc(finFxRates.rateDate))
    .limit(1);
  if (!row) return null;
  return Math.round((amountCents * row.rate) / MICRO);
}

/** Store / update a rate. `usdPerUnit` is plain USD per 1 unit
 *  (e.g., 0.000028 for VES). Converts to micro-USD internally. */
export async function setRate(opts: {
  currency: CurrencyCode;
  usdPerUnit: number;
  rateDate?: Date;
  source?: string;
}): Promise<void> {
  const date = (opts.rateDate ?? new Date()).toISOString().slice(0, 10);
  const micro = Math.round(opts.usdPerUnit * MICRO);
  await db
    .insert(finFxRates)
    .values({
      currency: opts.currency,
      rateDate: date,
      rateUsd: micro,
      source: opts.source ?? "manual",
    })
    .onConflictDoUpdate({
      target: [finFxRates.currency, finFxRates.rateDate],
      set: { rateUsd: micro, source: opts.source ?? "manual" },
    });
}

/** Format cents in a currency for display. Returns e.g., "$1,234.50" or "Bs. 2.500,00". */
export function formatMoney(
  cents: number | null | undefined,
  currency: CurrencyCode = "USD",
): string {
  if (cents == null) return "—";
  const value = cents / 100;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

/** Compact version: $1.2K, $4.5M */
export function formatMoneyCompact(
  cents: number | null | undefined,
  currency: CurrencyCode = "USD",
): string {
  if (cents == null) return "—";
  const value = cents / 100;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(0)}`;
  }
}
