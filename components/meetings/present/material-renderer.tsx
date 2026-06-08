"use client";

import { useState } from "react";
import { ExternalLink, FileText, ImageOff } from "lucide-react";
import type { PresentMaterial } from "./present-stage";

function isHtml(m: PresentMaterial) {
  return (
    m.mimeType === "text/html" ||
    /\.html?$/i.test(m.label) ||
    /\.html?($|\?)/i.test(m.fileUrl ?? "")
  );
}
function isPdf(m: PresentMaterial) {
  return m.mimeType === "application/pdf" || /\.pdf($|\?)/i.test(m.fileUrl ?? "");
}
function isImage(m: PresentMaterial) {
  return (m.mimeType ?? "").startsWith("image/");
}

/** Renders a single material to fill the stage, chosen by kind/mime. */
export function MaterialRenderer({ material }: { material: PresentMaterial }) {
  // Stored file → deck (html), pdf, or image.
  if (material.kind === "file" && material.fileUrl) {
    if (isImage(material)) {
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={material.fileUrl}
          alt={material.label}
          className="max-h-full max-w-full object-contain"
        />
      );
    }
    if (isHtml(material) || isPdf(material)) {
      return <Frame src={material.fileUrl} title={material.label} />;
    }
    return <OpenCard material={material} href={material.fileUrl} />;
  }

  // External link → try to embed; offer open-out as a fallback.
  if (material.kind === "link" && material.url) {
    return (
      <Frame
        src={material.url}
        title={material.label}
        fallbackHref={material.url}
      />
    );
  }

  // doc / note → typographic card (no inline editor in present mode).
  return <TextCard material={material} />;
}

/** Sandboxed iframe with a load shimmer so material switches feel instant. */
function Frame({
  src,
  title,
  fallbackHref,
}: {
  src: string;
  title: string;
  fallbackHref?: string;
}) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div className="relative h-full w-full">
      {!loaded && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-neutral-900">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-white/20 border-t-white/80" />
        </div>
      )}
      <iframe
        src={src}
        title={title}
        onLoad={() => setLoaded(true)}
        className="h-full w-full border-0 bg-white"
        sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
      />
      {fallbackHref && (
        <a
          href={fallbackHref}
          target="_blank"
          rel="noopener noreferrer"
          className="absolute right-4 top-4 z-20 flex items-center gap-1.5 rounded-md bg-black/70 px-3 py-1.5 text-xs font-medium text-white backdrop-blur hover:bg-black/90"
        >
          <ExternalLink className="h-3.5 w-3.5" /> Open if blank
        </a>
      )}
    </div>
  );
}

function OpenCard({
  material,
  href,
}: {
  material: PresentMaterial;
  href: string;
}) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-5 bg-neutral-900 px-8 text-center">
      <FileText className="h-12 w-12 text-neutral-500" />
      <div className="text-xl font-semibold text-white">{material.label}</div>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 rounded-md bg-white px-5 py-2.5 text-sm font-medium text-black hover:bg-neutral-200"
      >
        <ExternalLink className="h-4 w-4" /> Open material
      </a>
    </div>
  );
}

function TextCard({ material }: { material: PresentMaterial }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-gradient-to-br from-neutral-900 to-neutral-800 px-10 text-center">
      {material.kind === "doc" ? (
        <FileText className="h-12 w-12 text-neutral-500" />
      ) : (
        <ImageOff className="h-12 w-12 text-neutral-600" />
      )}
      <div className="max-w-3xl text-3xl font-semibold leading-tight text-white">
        {material.label}
      </div>
      {material.description && (
        <p className="max-w-2xl text-base text-neutral-300">
          {material.description}
        </p>
      )}
    </div>
  );
}
