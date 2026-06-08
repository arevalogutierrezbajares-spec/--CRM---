"use client";

import { motion } from "framer-motion";
import {
  Building2,
  Camera,
  CircleDollarSign,
  GraduationCap,
  HandHeart,
  MapPin,
  MessageCircle,
  Radio,
  Route,
  Sprout,
  Users,
} from "lucide-react";
import Image from "next/image";
import type { PitchFeedbackVisual } from "@/lib/pitch-feedback/types";
import { cn } from "@/lib/utils";

const MAP_MARKERS = [
  { left: "44%", top: "32%" },
  { left: "62%", top: "20%" },
  { left: "52%", top: "48%" },
  { left: "36%", top: "58%" },
  { left: "66%", top: "62%" },
];

export function SectionVisual({
  visual,
  sectionKey,
}: {
  visual?: PitchFeedbackVisual;
  sectionKey: string;
}) {
  if (!visual) return null;

  return (
    <motion.figure
      key={`${sectionKey}-${visual.kind}`}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.08, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="mt-6 overflow-hidden rounded-xl bg-[var(--secondary)] shadow-[inset_0_0_0_1px_var(--border)]"
    >
      {visual.kind === "image" && <ImageVisual visual={visual} />}
      {visual.kind === "placeholder" && <PlaceholderVisual visual={visual} />}
      {visual.kind === "metric" && <MetricVisual visual={visual} />}
      {visual.kind === "system" && <SystemVisual visual={visual} />}
      {visual.kind === "map" && <MapVisual visual={visual} />}
      {visual.kind === "impact" && <ImpactVisual visual={visual} />}
      {visual.kind === "people" && <PeopleVisual visual={visual} />}
      {visual.kind === "brand" && <BrandVisual visual={visual} />}
      {visual.caption && (
        <figcaption className="border-t border-[var(--border)] px-4 py-3 text-xs leading-5 text-[var(--muted-foreground)] sm:px-5">
          {visual.caption}
        </figcaption>
      )}
    </motion.figure>
  );
}

function ImageVisual({ visual }: { visual: PitchFeedbackVisual }) {
  const src = visual.src ?? "/caney-placeholder.svg";

  return (
    <div className="relative aspect-[16/10] min-h-[220px] overflow-hidden">
      <Image
        src={src}
        alt={visual.alt ?? visual.title ?? "CaneyCloud visual"}
        fill
        sizes="(min-width: 1280px) 760px, (min-width: 1024px) 50vw, 100vw"
        className="object-cover"
        priority={src === "/videos/angel-falls.jpg"}
      />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(20,19,15,0.04),rgba(20,19,15,0.70))]" />
      <div className="absolute inset-x-0 bottom-0 p-4 text-[var(--primary-foreground)] sm:p-5">
        {visual.label && (
          <span className="inline-flex items-center gap-1.5 rounded-md bg-[rgba(245,244,240,0.14)] px-2 py-1 text-xs font-medium">
            <MapPin className="h-3.5 w-3.5" />
            {visual.label}
          </span>
        )}
        {visual.title && (
          <p className="mt-3 max-w-xl text-2xl font-semibold leading-tight text-balance sm:text-3xl">
            {visual.title}
          </p>
        )}
      </div>
    </div>
  );
}

function PlaceholderVisual({ visual }: { visual: PitchFeedbackVisual }) {
  return (
    <div className="relative aspect-[16/10] min-h-[220px] overflow-hidden p-4 sm:p-5">
      <div
        className="absolute inset-0 opacity-80"
        style={{
          backgroundImage:
            "linear-gradient(135deg, var(--bg-card), var(--bg-surface))",
        }}
      />
      <div
        className="absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }}
      />
      <div className="relative flex h-full flex-col justify-between">
        <span className="inline-flex w-fit items-center gap-2 rounded-md bg-[var(--background)] px-2.5 py-1.5 text-xs font-medium text-[var(--muted-foreground)] shadow-[inset_0_0_0_1px_var(--border)]">
          <Camera className="h-3.5 w-3.5" />
          Photo slot
        </span>
        <div>
          {visual.label && (
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
              {visual.label}
            </p>
          )}
          <p className="mt-2 max-w-lg text-2xl font-semibold leading-tight text-balance sm:text-3xl">
            {visual.title ?? "Image placeholder"}
          </p>
        </div>
      </div>
    </div>
  );
}

function MetricVisual({ visual }: { visual: PitchFeedbackVisual }) {
  const metrics = visual.metrics ?? [];

  return (
    <div className="p-4 sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          {visual.label && (
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
              {visual.label}
            </p>
          )}
          {visual.stat && (
            <p className="mt-2 text-5xl font-semibold tracking-tight sm:text-6xl">
              {visual.stat}
            </p>
          )}
        </div>
        <Route className="mt-1 h-8 w-8 shrink-0 text-[var(--muted-foreground)]" />
      </div>
      {visual.title && (
        <p className="mt-4 max-w-xl text-lg font-medium leading-7 text-pretty">
          {visual.title}
        </p>
      )}
      {metrics.length > 0 && (
        <div className="mt-5 grid overflow-hidden rounded-lg bg-[var(--background)] shadow-[inset_0_0_0_1px_var(--border)] sm:grid-cols-3">
          {metrics.map((metric, metricIndex) => (
            <div
              key={`${metric.value}-${metric.label}`}
              className={cn(
                "p-4",
                metricIndex > 0 &&
                  "border-t border-[var(--border)] sm:border-l sm:border-t-0",
              )}
            >
              <div className="text-2xl font-semibold tracking-tight">
                {metric.value}
              </div>
              <div className="mt-1 text-xs leading-5 text-[var(--muted-foreground)]">
                {metric.label}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SystemVisual({ visual }: { visual: PitchFeedbackVisual }) {
  const points = visual.points ?? [];
  const icons = [
    Building2,
    MessageCircle,
    GraduationCap,
    HandHeart,
    CircleDollarSign,
    Radio,
  ];

  return (
    <div className="p-4 sm:p-5">
      <div className="flex items-center gap-3">
        <div className="relative h-12 w-12 shrink-0">
          <Image src="/logos/caneycloud.svg" alt="" fill sizes="48px" />
        </div>
        <div>
          <p className="text-lg font-semibold">CaneyCloud</p>
          <p className="text-sm text-[var(--muted-foreground)]">
            {visual.label ?? "Hospitality OS"}
          </p>
        </div>
      </div>
      {visual.title && (
        <p className="mt-4 max-w-xl text-lg font-medium leading-7 text-pretty">
          {visual.title}
        </p>
      )}
      {points.length > 0 && (
        <div className="mt-5 space-y-2">
          {points.map((point, pointIndex) => {
            const Icon = icons[pointIndex % icons.length];
            return (
              <motion.div
                key={point}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{
                  delay: 0.12 + pointIndex * 0.05,
                  duration: 0.25,
                  ease: [0.16, 1, 0.3, 1],
                }}
                className="flex items-center gap-3 rounded-lg bg-[var(--background)] px-3 py-3 shadow-[inset_0_0_0_1px_var(--border)]"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-[var(--secondary)] text-[var(--muted-foreground)]">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 text-sm font-medium">{point}</span>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MapVisual({ visual }: { visual: PitchFeedbackVisual }) {
  const points = visual.points?.length
    ? visual.points
    : ["Canaima", "Los Roques", "Andes", "Caracas", "Coastal towns"];

  return (
    <div className="relative aspect-[16/10] min-h-[240px] overflow-hidden bg-[var(--background)] p-4 sm:p-5">
      <div className="absolute left-[34%] top-[15%] h-[68%] w-[38%] -rotate-12 rounded-[48%_35%_50%_44%] bg-[var(--secondary)] shadow-[inset_0_0_0_1px_var(--border-emphasis)]" />
      <div className="absolute left-[20%] top-[44%] h-[22%] w-[44%] -rotate-6 rounded-full border border-[var(--border)]" />
      <div className="relative z-10 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
        <MapPin className="h-3.5 w-3.5" />
        {visual.label ?? "Venezuela"}
      </div>
      {visual.title && (
        <p className="relative z-10 mt-3 max-w-sm text-2xl font-semibold leading-tight text-balance sm:text-3xl">
          {visual.title}
        </p>
      )}
      {points.slice(0, 5).map((point, pointIndex) => {
        const marker = MAP_MARKERS[pointIndex % MAP_MARKERS.length];
        return (
          <motion.div
            key={point}
            className="absolute z-20"
            style={{ left: marker.left, top: marker.top }}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.12 + pointIndex * 0.07, duration: 0.3 }}
          >
            <span className="relative flex h-3.5 w-3.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--primary)] opacity-25" />
              <span className="relative inline-flex h-3.5 w-3.5 rounded-full bg-[var(--primary)] shadow-[0_0_0_3px_var(--bg-card)]" />
            </span>
            <span className="mt-1 block rounded-md bg-[var(--card)] px-2 py-1 text-xs font-medium shadow-[0_8px_24px_rgba(20,19,15,0.12),inset_0_0_0_1px_var(--border)]">
              {point}
            </span>
          </motion.div>
        );
      })}
    </div>
  );
}

function ImpactVisual({ visual }: { visual: PitchFeedbackVisual }) {
  const metrics = visual.metrics ?? [];
  const icons = [Sprout, Users, GraduationCap, HandHeart];

  return (
    <div className="p-4 sm:p-5">
      {visual.label && (
        <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
          {visual.label}
        </p>
      )}
      {visual.title && (
        <p className="mt-2 max-w-xl text-2xl font-semibold leading-tight text-balance sm:text-3xl">
          {visual.title}
        </p>
      )}
      {metrics.length > 0 && (
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {metrics.map((metric, metricIndex) => {
            const Icon = icons[metricIndex % icons.length];
            const height = 40 + (metricIndex % 4) * 12;
            return (
              <div
                key={`${metric.value}-${metric.label}`}
                className="flex min-h-[92px] items-end gap-3 rounded-lg bg-[var(--background)] p-3 shadow-[inset_0_0_0_1px_var(--border)]"
              >
                <div className="flex h-full min-h-[68px] items-end">
                  <motion.div
                    className="w-3 rounded-t-full bg-[var(--primary)]"
                    initial={{ height: 8 }}
                    animate={{ height }}
                    transition={{
                      delay: 0.1 + metricIndex * 0.05,
                      duration: 0.35,
                      ease: [0.16, 1, 0.3, 1],
                    }}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <Icon className="mb-2 h-4 w-4 text-[var(--muted-foreground)]" />
                  <div className="text-xl font-semibold tracking-tight">
                    {metric.value}
                  </div>
                  <div className="mt-1 text-xs leading-5 text-[var(--muted-foreground)]">
                    {metric.label}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PeopleVisual({ visual }: { visual: PitchFeedbackVisual }) {
  const people = visual.points ?? [];

  return (
    <div className="p-4 sm:p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          {visual.label && (
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
              {visual.label}
            </p>
          )}
          {visual.title && (
            <p className="mt-2 text-2xl font-semibold leading-tight text-balance sm:text-3xl">
              {visual.title}
            </p>
          )}
        </div>
        <Users className="h-9 w-9 shrink-0 text-[var(--muted-foreground)]" />
      </div>
      {people.length > 0 && (
        <div className="mt-5 space-y-2">
          {people.map((person) => (
            <div
              key={person}
              className="flex items-center gap-3 rounded-lg bg-[var(--background)] px-3 py-3 shadow-[inset_0_0_0_1px_var(--border)]"
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--primary)] text-sm font-semibold text-[var(--primary-foreground)]">
                {initialsFor(person)}
              </span>
              <span className="text-base font-medium">{person}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BrandVisual({ visual }: { visual: PitchFeedbackVisual }) {
  return (
    <div className="grid min-h-[240px] place-items-center p-5 text-center sm:min-h-[300px]">
      <div>
        <div className="relative mx-auto h-20 w-20">
          <Image src={visual.src ?? "/logos/caneycloud.svg"} alt="" fill sizes="80px" />
        </div>
        {visual.label && (
          <p className="mt-5 text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
            {visual.label}
          </p>
        )}
        {visual.title && (
          <p className="mx-auto mt-2 max-w-xl text-3xl font-semibold leading-tight text-balance sm:text-4xl">
            {visual.title}
          </p>
        )}
        {visual.stat && (
          <p className="mx-auto mt-4 max-w-md text-sm leading-6 text-[var(--muted-foreground)] text-pretty">
            {visual.stat}
          </p>
        )}
      </div>
    </div>
  );
}

function initialsFor(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}
