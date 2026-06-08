/**
 * Derive the absolute origin (e.g. "https://crm.example.com") of the incoming
 * request from forwarding headers, so discovery docs and OAuth metadata advertise
 * URLs that actually resolve on localhost, preview, and prod alike. Mirrors the
 * host/proto derivation in app/actions/auth.ts.
 */
export function requestOrigin(headers: Headers): string {
  const host =
    headers.get("x-forwarded-host") ?? headers.get("host") ?? "localhost:3000";
  const proto =
    headers.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
