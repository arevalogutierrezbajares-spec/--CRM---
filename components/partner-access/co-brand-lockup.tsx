import type { BrandLogo } from "@/db/queries/partner-access";

/**
 * Co-branded lockup for a partner room: the owner's involved project (LoB) logos
 * on the left, the client's logo on the right, joined by a thin divider. Renders
 * nothing when neither side has a logo. Plain <img> (logos are public URLs).
 */
export function CoBrandLockup({
  brandLogos,
  clientLogoUrl,
  clientName,
  size = 44,
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
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      {hasMine && (
        <div className="flex items-center gap-2">
          {brandLogos.map((logo) => (
            <LogoTile
              key={logo.lobId}
              src={logo.logoUrl}
              srcDark={logo.logoUrlDark}
              alt={`${logo.title} logo`}
              size={size}
            />
          ))}
        </div>
      )}

      {hasMine && hasClient && (
        <span
          aria-hidden
          className="h-7 w-px shrink-0 bg-[var(--border)]"
        />
      )}

      {hasClient && (
        <LogoTile
          src={clientLogoUrl as string}
          srcDark={null}
          alt={clientName ? `${clientName} logo` : "Client logo"}
          size={size}
        />
      )}
    </div>
  );
}

function LogoTile({
  src,
  srcDark,
  alt,
  size,
}: {
  src: string;
  srcDark: string | null;
  alt: string;
  size: number;
}) {
  return (
    <div
      className="grid shrink-0 place-items-center overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--card)] p-1.5"
      style={{ width: size, height: size }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        className={
          srcDark ? "max-h-full max-w-full object-contain dark:hidden" : "max-h-full max-w-full object-contain"
        }
      />
      {srcDark && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={srcDark}
          alt=""
          aria-hidden
          className="hidden max-h-full max-w-full object-contain dark:block"
        />
      )}
    </div>
  );
}
