import { Plus } from "lucide-react";
import type { BrandLogo } from "@/db/queries/partner-access";

/**
 * Co-branded lockup for a partner room — circular logo badges. The client's mark
 * sits first (larger), joined by a "+" to the owner's involved project logos.
 * Renders nothing when neither side has a logo. Plain <img> (logos are URLs).
 */
export function CoBrandLockup({
  brandLogos,
  clientLogoUrl,
  clientName,
  size = 60,
}: {
  brandLogos: BrandLogo[];
  clientLogoUrl: string | null;
  clientName: string | null;
  size?: number;
}) {
  const hasMine = brandLogos.length > 0;
  const hasClient = Boolean(clientLogoUrl);
  if (!hasMine && !hasClient) return null;

  return (
    <div className="flex flex-wrap items-center gap-3">
      {hasClient && (
        <LogoCircle
          src={clientLogoUrl as string}
          label={clientName ? `${clientName} logo` : "Logo del cliente"}
          size={size}
          ring
          fill
        />
      )}

      {hasMine && hasClient && (
        <span
          aria-hidden
          className="grid h-6 w-6 place-items-center rounded-full bg-[var(--secondary)] text-[var(--muted-foreground)]"
        >
          <Plus className="h-3.5 w-3.5" />
        </span>
      )}

      {hasMine && (
        <div className="flex flex-wrap items-center gap-2">
          {brandLogos.map((logo) => (
            <LogoCircle
              key={logo.lobId}
              src={logo.logoUrl}
              label={`${logo.title} logo`}
              size={hasClient ? size - 8 : size}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function LogoCircle({
  src,
  label,
  size,
  ring,
  fill,
}: {
  src: string;
  label: string;
  size: number;
  ring?: boolean;
  /** Fill the whole circle edge-to-edge (object-cover) — for a client photo /
   *  square brand image. Without it, the logo is contained with padding (app
   *  icons / wordmarks). */
  fill?: boolean;
}) {
  // A filled circle crops to cover with no padding; a contained one letterboxes
  // the mark on a white plate. Brand plates stay white in dark mode too — the
  // light logo variant is the only one rendered, so the mark is always legible.
  const imgClass = fill
    ? "h-full w-full object-cover"
    : "max-h-full max-w-full object-contain";
  return (
    <div
      title={label}
      className={`grid shrink-0 place-items-center overflow-hidden rounded-full shadow-sm ${
        fill ? "bg-[var(--secondary)]" : "bg-white"
      } ${ring ? "ring-2 ring-[var(--border)]" : "ring-1 ring-[var(--border)]"}`}
      style={{
        width: size,
        height: size,
        padding: fill ? 0 : Math.round(size * 0.16),
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={label} className={imgClass} />
    </div>
  );
}
