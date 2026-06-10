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
          srcDark={null}
          label={clientName ? `${clientName} logo` : "Client logo"}
          size={size}
          ring
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
              srcDark={logo.logoUrlDark}
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
  srcDark,
  label,
  size,
  ring,
}: {
  src: string;
  srcDark: string | null;
  label: string;
  size: number;
  ring?: boolean;
}) {
  return (
    <div
      title={label}
      className={`grid shrink-0 place-items-center overflow-hidden rounded-full bg-white shadow-sm dark:bg-[var(--card)] ${
        ring
          ? "ring-2 ring-[var(--primary)]/30"
          : "ring-1 ring-[var(--border)]"
      }`}
      style={{ width: size, height: size, padding: Math.round(size * 0.16) }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={label}
        className={
          srcDark ? "max-h-full max-w-full object-contain dark:hidden" : "max-h-full max-w-full object-contain"
        }
      />
      {srcDark && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={srcDark} alt="" aria-hidden className="hidden max-h-full max-w-full object-contain dark:block" />
      )}
    </div>
  );
}
