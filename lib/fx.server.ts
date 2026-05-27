/**
 * Server-only FX helpers — touch the DB.
 *
 * Kept separate from lib/fx.ts because importing @/db pulls in the postgres
 * driver, which can't bundle for the client (node-only `fs`, `net`, `tls`).
 */

import "server-only";
import { and, desc, eq, lte } from "drizzle-orm";
import { db, schema } from "@/db";
import { MICRO, type CurrencyCode } from "./fx";

const { finFxRates } = schema;

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
