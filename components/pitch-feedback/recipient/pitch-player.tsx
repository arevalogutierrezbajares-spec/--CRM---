"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Camera,
  Check,
  CircleDollarSign,
  GraduationCap,
  HandHeart,
  Lock,
  MapPin,
  MessageCircle,
  PauseCircle,
  Radio,
  Route,
  Send,
  Sparkles,
  Sprout,
  Users,
} from "lucide-react";
import Image from "next/image";
import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type {
  PitchFeedbackPersonalization,
  PitchFeedbackPrompt,
  PitchFeedbackSection,
  PitchFeedbackVisual,
} from "@/lib/pitch-feedback/types";
import { cn } from "@/lib/utils";

type InitialResponse = {
  sectionKey: string;
  promptKey: string;
  responseType: string;
  value: Record<string, unknown>;
};

const REACTIONS = [
  "clear",
  "exciting",
  "useful",
  "confused",
  "skeptical",
  "want more",
];

export function PitchFeedbackPlayer({
  token,
  sessionId,
  campaign,
  contact,
  invite,
  sections,
  initialResponses,
}: {
  token: string;
  sessionId: string;
  campaign: {
    id: string;
    name: string;
    description: string | null;
    audience: string;
  };
  contact: {
    id: string;
    name: string;
    organization: string | null;
  };
  invite: {
    id: string;
    status: string;
    completionPercent: number;
    currentSectionKey: string | null;
    personalization: PitchFeedbackPersonalization;
  };
  sections: PitchFeedbackSection[];
  initialResponses: InitialResponse[];
}) {
  const initialIndex = useMemo(() => {
    if (!invite.currentSectionKey) return 0;
    const found = sections.findIndex((section) => section.key === invite.currentSectionKey);
    return found >= 0 ? found : 0;
  }, [invite.currentSectionKey, sections]);
  const [index, setIndex] = useState(initialIndex);
  const [answers, setAnswers] = useState<Record<string, Record<string, unknown>>>(() => {
    const initial: Record<string, Record<string, unknown>> = {};
    for (const response of initialResponses) {
      initial[response.promptKey] = response.value;
    }
    return initial;
  });
  const [completed, setCompleted] = useState(invite.status === "completed");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const section = sections[index] ?? sections[0];
  const progress = sections.length
    ? Math.round(((completed ? sections.length : index + 1) / sections.length) * 100)
    : 0;

  function setAnswer(prompt: PitchFeedbackPrompt, value: Record<string, unknown>) {
    setAnswers((current) => ({ ...current, [prompt.key]: value }));
  }

  function answerIsEmpty(prompt: PitchFeedbackPrompt) {
    const value = answers[prompt.key];
    if (!value) return true;
    if (typeof value.text === "string") return value.text.trim().length === 0;
    if (typeof value.reaction === "string") return value.reaction.trim().length === 0;
    if (typeof value.score === "number") return false;
    return Object.keys(value).length === 0;
  }

  function requiredMissing() {
    return section.prompts.some((prompt) => prompt.required && answerIsEmpty(prompt));
  }

  function persist(nextIndex: number, isComplete: boolean) {
    if (requiredMissing()) {
      setError("Answer the required prompt before finishing this section.");
      return;
    }

    setError(null);
    const responses = section.prompts
      .filter((prompt) => !answerIsEmpty(prompt))
      .map((prompt) => ({
        promptKey: prompt.key,
        responseType: prompt.type,
        value: answers[prompt.key],
      }));
    const currentSectionKey = sections[nextIndex]?.key ?? section.key;
    const progressPercent = isComplete
      ? 100
      : Math.round(((Math.min(nextIndex, sections.length - 1) + 1) / sections.length) * 100);

    startTransition(async () => {
      const res = await fetch("/api/pitch-feedback/respond", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          token,
          sessionId,
          sectionKey: section.key,
          currentSectionKey,
          progressPercent,
          responses,
          completed: isComplete,
        }),
      });

      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(json?.error ?? "Feedback save failed. Try again.");
        return;
      }

      if (isComplete) {
        setCompleted(true);
      } else {
        setIndex(nextIndex);
      }
    });
  }

  if (!sections.length) {
    return (
      <main className="grid min-h-screen place-items-center bg-[var(--bg-page)] p-5">
        <div className="max-w-md rounded-xl bg-[var(--card)] p-6 text-center shadow-[0_18px_70px_rgba(0,0,0,0.12),inset_0_0_0_1px_var(--border)]">
          <h1 className="text-xl font-semibold">Nothing to review yet</h1>
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">
            The sender has not published any sections for this private review.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--bg-page)] text-[var(--foreground)]">
      <div className="mx-auto grid min-h-screen w-full max-w-7xl grid-rows-[auto_1fr] px-4 py-4 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-3 border-b border-[var(--border)] pb-4 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-md bg-[var(--secondary)] px-2 py-1 text-xs font-medium text-[var(--secondary-foreground)]">
                <Lock className="h-3.5 w-3.5" />
                Private silent review
              </span>
              <span className="text-xs text-[var(--muted-foreground)]">
                Progress and feedback are saved for Tomas to review.
              </span>
            </div>
            <h1 className="mt-2 truncate text-xl font-semibold tracking-tight sm:text-2xl">
              {campaign.name}
            </h1>
          </div>
          <div className="min-w-[180px]">
            <div className="flex items-center justify-between text-xs text-[var(--muted-foreground)]">
              <span>Progress</span>
              <span className="tabular-nums">{progress}%</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--secondary)]">
              <motion.div
                className="h-full rounded-full bg-[var(--primary)]"
                initial={false}
                animate={{ width: `${progress}%` }}
                transition={{ type: "spring", duration: 0.35, bounce: 0 }}
              />
            </div>
          </div>
        </header>

        <section className="grid min-h-0 gap-4 py-4 lg:grid-cols-[280px_1fr_340px]">
          <aside className="hidden min-h-0 rounded-xl bg-[var(--card)] p-3 shadow-[inset_0_0_0_1px_var(--border)] lg:block">
            <div className="mb-3 flex items-center gap-2 px-2 text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
              <Sparkles className="h-3.5 w-3.5" />
              Walkthrough
            </div>
            <ol className="space-y-1">
              {sections.map((item, itemIndex) => (
                <li key={item.key}>
                  <button
                    type="button"
                    className="flex min-h-[40px] w-full items-center gap-2 rounded-lg px-2 text-left text-sm transition-colors hover:bg-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={pending}
                    onClick={() => {
                      if (itemIndex <= index) setIndex(itemIndex);
                    }}
                  >
                    <span
                      className={
                        itemIndex < index || completed
                          ? "flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[var(--primary)] text-[var(--primary-foreground)]"
                          : itemIndex === index
                            ? "flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[var(--secondary)] text-[var(--foreground)] shadow-[inset_0_0_0_1px_var(--border)]"
                            : "flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[var(--secondary)] text-[var(--muted-foreground)]"
                      }
                    >
                      {itemIndex < index || completed ? (
                        <Check className="h-3.5 w-3.5" />
                      ) : (
                        <span className="text-xs tabular-nums">{itemIndex + 1}</span>
                      )}
                    </span>
                    <span className="line-clamp-2">{item.title}</span>
                  </button>
                </li>
              ))}
            </ol>
          </aside>

          <div className="min-h-0">
            <AnimatePresence mode="wait" initial={false}>
              {completed ? (
                <motion.div
                  key="complete"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ type: "spring", duration: 0.35, bounce: 0 }}
                  className="grid min-h-[68vh] place-items-center rounded-xl bg-[var(--card)] p-6 shadow-[0_20px_80px_rgba(0,0,0,0.12),inset_0_0_0_1px_var(--border)]"
                >
                  <div className="max-w-lg text-center">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--primary)] text-[var(--primary-foreground)]">
                      <Check className="h-6 w-6" />
                    </div>
                    <h2 className="mt-5 text-3xl font-semibold tracking-tight text-balance">
                      Feedback received
                    </h2>
                    <p className="mt-3 text-sm leading-6 text-[var(--muted-foreground)] text-pretty">
                      Thanks for taking the time. Your comments were saved to the
                      private CRM review tied to this contact relationship.
                    </p>
                  </div>
                </motion.div>
              ) : (
                <motion.article
                  key={section.key}
                  initial={{ opacity: 0, y: 16, filter: "blur(4px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  exit={{ opacity: 0, y: -8, filter: "blur(2px)" }}
                  transition={{ type: "spring", duration: 0.35, bounce: 0 }}
                  className="flex min-h-[68vh] flex-col rounded-xl bg-[var(--card)] p-5 shadow-[0_20px_80px_rgba(0,0,0,0.12),inset_0_0_0_1px_var(--border)] sm:p-7"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    {section.eyebrow && (
                      <span className="text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
                        {section.eyebrow}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1 rounded-md bg-[var(--secondary)] px-2 py-1 text-xs text-[var(--secondary-foreground)]">
                      <PauseCircle className="h-3.5 w-3.5" />
                      No voice
                    </span>
                  </div>

                  <div className="mt-7 max-w-3xl">
                    <h2 className="text-3xl font-semibold tracking-tight text-balance sm:text-5xl">
                      {section.title}
                    </h2>
                    <SectionVisual visual={section.visual} sectionKey={section.key} />
                    <p className="mt-5 text-base leading-7 text-[var(--muted-foreground)] text-pretty sm:text-lg">
                      {section.body}
                    </p>
                    {section.proof && (
                      <div className="mt-5 rounded-lg bg-[var(--secondary)] p-4 text-sm leading-6 text-[var(--secondary-foreground)] shadow-[inset_0_0_0_1px_var(--border)]">
                        {section.proof}
                      </div>
                    )}
                  </div>

                  <div className="mt-7 lg:hidden">
                    <FeedbackPanelContent
                      contact={contact}
                      index={index}
                      invite={invite}
                      section={section}
                      answers={answers}
                      onAnswer={setAnswer}
                    />
                  </div>

                  <div className="mt-auto pt-8">
                    <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
                      <Button
                        type="button"
                        variant="outline"
                        disabled={index === 0 || pending}
                        onClick={() => setIndex((current) => Math.max(0, current - 1))}
                      >
                        <ArrowLeft className="h-4 w-4" />
                        Back
                      </Button>
                      <Button
                        type="button"
                        loading={pending}
                        onClick={() =>
                          index === sections.length - 1
                            ? persist(index, true)
                            : persist(index + 1, false)
                        }
                      >
                        {index === sections.length - 1 ? (
                          <>
                            <Send className="h-4 w-4" />
                            Submit feedback
                          </>
                        ) : (
                          <>
                            Continue
                            <ArrowRight className="h-4 w-4" />
                          </>
                        )}
                      </Button>
                    </div>
                    {error && (
                      <p className="mt-3 rounded-md bg-[var(--destructive)]/10 px-3 py-2 text-sm text-[var(--destructive)]">
                        {error}
                      </p>
                    )}
                  </div>
                </motion.article>
              )}
            </AnimatePresence>
          </div>

          {!completed && (
            <aside className="hidden rounded-xl bg-[var(--card)] p-4 shadow-[inset_0_0_0_1px_var(--border)] lg:block lg:min-h-[68vh]">
              <FeedbackPanelContent
                contact={contact}
                index={index}
                invite={invite}
                section={section}
                answers={answers}
                onAnswer={setAnswer}
              />
            </aside>
          )}
        </section>
      </div>
    </main>
  );
}

const MAP_MARKERS = [
  { left: "44%", top: "32%" },
  { left: "62%", top: "20%" },
  { left: "52%", top: "48%" },
  { left: "36%", top: "58%" },
  { left: "66%", top: "62%" },
];

function SectionVisual({
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

function FeedbackPanelContent({
  contact,
  index,
  invite,
  section,
  answers,
  onAnswer,
}: {
  contact: {
    id: string;
    name: string;
    organization: string | null;
  };
  index: number;
  invite: {
    personalization: PitchFeedbackPersonalization;
  };
  section: PitchFeedbackSection;
  answers: Record<string, Record<string, unknown>>;
  onAnswer: (prompt: PitchFeedbackPrompt, value: Record<string, unknown>) => void;
}) {
  return (
    <div className="rounded-xl bg-[var(--background)] p-4 shadow-[inset_0_0_0_1px_var(--border)] lg:rounded-none lg:bg-transparent lg:p-0 lg:shadow-none">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <MessageCircle className="h-4 w-4" />
        Feedback in context
      </div>
      <p className="mt-2 text-xs leading-5 text-[var(--muted-foreground)]">
        React honestly as you move through the pitch. Short, specific notes are
        more useful than polished answers.
      </p>

      {index === 0 && invite.personalization?.welcomeNote && (
        <div className="mt-4 rounded-lg bg-[var(--ai-bg)] p-3 text-sm leading-6 text-[var(--ai-subtext)] shadow-[inset_0_0_0_1px_var(--ai-border)]">
          {invite.personalization.welcomeNote}
        </div>
      )}

      <div className="mt-4 space-y-4">
        {section.prompts.map((prompt) => (
          <PromptControl
            key={prompt.key}
            prompt={prompt}
            value={answers[prompt.key]}
            onChange={(value) => onAnswer(prompt, value)}
          />
        ))}
      </div>

      <div className="mt-5 flex items-center justify-between gap-3 rounded-lg bg-[var(--secondary)] p-3 text-xs text-[var(--muted-foreground)]">
        <span>For</span>
        <span className="min-w-0 truncate text-right font-medium text-[var(--foreground)]">
          {contact.name}
        </span>
      </div>
    </div>
  );
}

function PromptControl({
  prompt,
  value,
  onChange,
}: {
  prompt: PitchFeedbackPrompt;
  value: Record<string, unknown> | undefined;
  onChange: (value: Record<string, unknown>) => void;
}) {
  if (prompt.type === "reaction") {
    const selected = typeof value?.reaction === "string" ? value.reaction : "";
    return (
      <div className="space-y-2">
        <div className="text-sm font-medium">
          {prompt.label}
          {prompt.required && <span className="text-[var(--destructive)]"> *</span>}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {REACTIONS.map((reaction) => (
            <button
              key={reaction}
              type="button"
              className={
                selected === reaction
                  ? "min-h-[40px] rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-medium text-[var(--primary-foreground)] transition-transform active:scale-[0.96]"
                  : "min-h-[40px] rounded-lg bg-[var(--secondary)] px-3 py-2 text-sm text-[var(--secondary-foreground)] shadow-[inset_0_0_0_1px_var(--border)] transition-transform hover:bg-[var(--accent)] active:scale-[0.96]"
              }
              onClick={() => onChange({ reaction })}
            >
              {reaction}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (prompt.type === "score") {
    const score = typeof value?.score === "number" ? value.score : 5;
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <label className="text-sm font-medium" htmlFor={prompt.key}>
            {prompt.label}
            {prompt.required && <span className="text-[var(--destructive)]"> *</span>}
          </label>
          <span className="rounded-md bg-[var(--secondary)] px-2 py-1 text-xs font-medium tabular-nums">
            {score}/10
          </span>
        </div>
        <input
          id={prompt.key}
          type="range"
          min="1"
          max="10"
          value={score}
          className="h-10 w-full accent-[var(--primary)]"
          onChange={(event) => onChange({ score: Number(event.target.value) })}
        />
      </div>
    );
  }

  const text = typeof value?.text === "string" ? value.text : "";
  const placeholder =
    prompt.type === "intro"
      ? "Name, company, or type of person..."
      : prompt.type === "objection"
        ? "What feels weak, unclear, or risky?"
        : prompt.type === "final"
          ? "What is the most important thing I should change or keep?"
          : "Short note...";

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium" htmlFor={prompt.key}>
        {prompt.label}
        {prompt.required && <span className="text-[var(--destructive)]"> *</span>}
      </label>
      <Textarea
        id={prompt.key}
        value={text}
        rows={prompt.type === "final" ? 5 : 3}
        placeholder={placeholder}
        onChange={(event) => onChange({ text: event.target.value })}
      />
    </div>
  );
}
