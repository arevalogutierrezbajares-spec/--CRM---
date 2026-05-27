/**
 * FX — client-safe formatters and shared constants.
 *
 * For server-only DB-touching helpers (toUsdCents, setRate) see lib/fx.server.ts.
 * Importing `@/db` here breaks the client build because Drizzle's postgres
 * driver pulls in `fs`, `net`, `tls`, etc. — split intentionally.
 *
 * Rate storage convention:
 *   rate_usd_per_million = (USD per 1 unit of currency) × 1_000_000
 *   so VES at 0.000028 USD/VES → rate_usd_per_million = 28
 *   and USD always has rate_usd_per_million = 1_000_000.
 */

export const MICRO = 1_000_000;

export type CurrencyCode = string; // ISO 4217 e.g. USD, VES, EUR, COP

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
