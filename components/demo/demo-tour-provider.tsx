"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, CheckCircle2, Flag, PauseCircle, Play, RotateCcw, Volume2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DEMO_TOUR_ACTIVE_KEY,
  DEMO_TOUR_COMPLETED_KEY,
  DEMO_TOUR_MODE_KEY,
  DEMO_TOUR_START_EVENT,
  DEMO_TOUR_STEP_KEY,
  DEMO_TOUR_STEPS,
  DEMO_TOUR_STOP_EVENT,
  demoTourAudioSrc,
  demoTourStepIndex,
  demoTourWaitEvent,
  type DemoTourMode,
} from "@/lib/demo-tour";

type DemoTourProviderProps = {
  children: React.ReactNode;
};

type HighlightRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

function readCompleted(): string[] {
  try {
    const raw = localStorage.getItem(DEMO_TOUR_COMPLETED_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeState(args: {
  active: boolean;
  mode: DemoTourMode;
  stepId: string;
  completed: string[];
}) {
  try {
    localStorage.setItem(DEMO_TOUR_ACTIVE_KEY, args.active ? "1" : "0");
    localStorage.setItem(DEMO_TOUR_MODE_KEY, args.mode);
    localStorage.setItem(DEMO_TOUR_STEP_KEY, args.stepId);
    localStorage.setItem(DEMO_TOUR_COMPLETED_KEY, JSON.stringify(args.completed));
  } catch {
    /* ignore */
  }
}

function clampStep(index: number): number {
  return Math.max(0, Math.min(DEMO_TOUR_STEPS.length - 1, index));
}

export function DemoTourProvider({ children }: DemoTourProviderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [active, setActive] = useState(false);
  const [mode, setMode] = useState<DemoTourMode>("guided");
  const [stepIndex, setStepIndex] = useState(0);
  const [completed, setCompleted] = useState<string[]>([]);
  const [practiceDone, setPracticeDone] = useState(false);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [highlight, setHighlight] = useState<HighlightRect | null>(null);

  const step = DEMO_TOUR_STEPS[stepIndex] ?? DEMO_TOUR_STEPS[0];
  const progressPct = ((stepIndex + 1) / DEMO_TOUR_STEPS.length) * 100;
  const isOnRoute = pathname === step.route;
  const waitEvent = step.waitFor ? demoTourWaitEvent(step.waitFor) : null;
  const canContinue = !step.waitFor || practiceDone;

  const completedSet = useMemo(() => new Set(completed), [completed]);

  const persist = useCallback(
    (next?: Partial<{ active: boolean; mode: DemoTourMode; stepIndex: number; completed: string[] }>) => {
      const nextActive = next?.active ?? active;
      const nextMode = next?.mode ?? mode;
      const nextIndex = next?.stepIndex ?? stepIndex;
      const nextCompleted = next?.completed ?? completed;
      writeState({
        active: nextActive,
        mode: nextMode,
        stepId: DEMO_TOUR_STEPS[clampStep(nextIndex)]?.id ?? DEMO_TOUR_STEPS[0]!.id,
        completed: nextCompleted,
      });
    },
    [active, completed, mode, stepIndex],
  );

  const goToStep = useCallback(
    (nextIndex: number) => {
      const clamped = clampStep(nextIndex);
      setStepIndex(clamped);
      setPracticeDone(false);
      setAudioBlocked(false);
      persist({ stepIndex: clamped });
    },
    [persist],
  );

  const stop = useCallback(() => {
    setActive(false);
    setHighlight(null);
    setPracticeDone(false);
    audioRef.current?.pause();
    persist({ active: false });
  }, [persist]);

  const start = useCallback(
    (nextMode: DemoTourMode = "guided") => {
      const firstIndex = nextMode === "practice" ? 2 : 0;
      const nextCompleted = readCompleted();
      setMode(nextMode);
      setStepIndex(firstIndex);
      setCompleted(nextCompleted);
      setPracticeDone(false);
      setAudioBlocked(false);
      setActive(true);
      writeState({
        active: true,
        mode: nextMode,
        stepId: DEMO_TOUR_STEPS[firstIndex]?.id ?? DEMO_TOUR_STEPS[0]!.id,
        completed: nextCompleted,
      });
    },
    [],
  );

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      try {
        const storedActive = localStorage.getItem(DEMO_TOUR_ACTIVE_KEY) === "1";
        const storedMode = (localStorage.getItem(DEMO_TOUR_MODE_KEY) as DemoTourMode | null) ?? "guided";
        const storedStep = localStorage.getItem(DEMO_TOUR_STEP_KEY);
        const storedCompleted = readCompleted();
        setActive(storedActive);
        setMode(storedMode === "practice" || storedMode === "presentation" ? storedMode : "guided");
        setStepIndex(demoTourStepIndex(storedStep));
        setCompleted(storedCompleted);
      } catch {
        /* ignore */
      }
    });

    const onStart = (event: Event) => {
      const custom = event as CustomEvent<{ mode?: DemoTourMode }>;
      start(custom.detail?.mode ?? "guided");
    };
    const onStop = () => stop();

    window.addEventListener(DEMO_TOUR_START_EVENT, onStart);
    window.addEventListener(DEMO_TOUR_STOP_EVENT, onStop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener(DEMO_TOUR_START_EVENT, onStart);
      window.removeEventListener(DEMO_TOUR_STOP_EVENT, onStop);
    };
  }, [start, stop]);

  useEffect(() => {
    if (!active || isOnRoute) return;
    router.push(step.route);
  }, [active, isOnRoute, router, step.route]);

  useEffect(() => {
    if (!active || !waitEvent) return;
    const onDone = () => setPracticeDone(true);
    window.addEventListener(waitEvent, onDone);
    return () => window.removeEventListener(waitEvent, onDone);
  }, [active, waitEvent]);

  const updateHighlight = useCallback(() => {
    if (!active || !isOnRoute || !step.highlightSelector) {
      setHighlight(null);
      return;
    }
    const target = document.querySelector(step.highlightSelector);
    if (!(target instanceof HTMLElement)) {
      setHighlight(null);
      return;
    }
    const rect = target.getBoundingClientRect();
    if (rect.width < 12 || rect.height < 12) {
      setHighlight(null);
      return;
    }
    setHighlight({
      top: Math.max(8, rect.top - 8),
      left: Math.max(8, rect.left - 8),
      width: Math.min(window.innerWidth - 16, rect.width + 16),
      height: Math.min(window.innerHeight - 16, rect.height + 16),
    });
  }, [active, isOnRoute, step.highlightSelector]);

  useEffect(() => {
    if (!active) return;
    const raf = requestAnimationFrame(updateHighlight);
    const id = window.setInterval(updateHighlight, 900);
    window.addEventListener("resize", updateHighlight);
    window.addEventListener("scroll", updateHighlight, true);
    return () => {
      cancelAnimationFrame(raf);
      window.clearInterval(id);
      window.removeEventListener("resize", updateHighlight);
      window.removeEventListener("scroll", updateHighlight, true);
    };
  }, [active, updateHighlight]);

  const replayAudio = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !active) return;
    audio.currentTime = 0;
    audio.src = demoTourAudioSrc(step.id);
    audio
      .play()
      .then(() => setAudioBlocked(false))
      .catch(() => setAudioBlocked(true));
  }, [active, step.id]);

  useEffect(() => {
    if (!active || !isOnRoute) return;
    const timeout = window.setTimeout(replayAudio, 350);
    return () => window.clearTimeout(timeout);
  }, [active, isOnRoute, replayAudio]);

  function markComplete(stepId: string): string[] {
    const next = Array.from(new Set([...completed, stepId]));
    setCompleted(next);
    return next;
  }

  function next() {
    const nextCompleted = markComplete(step.id);
    if (stepIndex >= DEMO_TOUR_STEPS.length - 1) {
      writeState({ active: false, mode, stepId: step.id, completed: nextCompleted });
      setActive(false);
      setHighlight(null);
      return;
    }
    const nextIndex = clampStep(stepIndex + 1);
    setStepIndex(nextIndex);
    setPracticeDone(false);
    setAudioBlocked(false);
    writeState({
      active: true,
      mode,
      stepId: DEMO_TOUR_STEPS[nextIndex]?.id ?? step.id,
      completed: nextCompleted,
    });
  }

  function skipPractice() {
    setPracticeDone(true);
  }

  return (
    <>
      {children}
      <audio ref={audioRef} preload="auto" aria-hidden="true" onError={() => setAudioBlocked(true)} />
      {active && (
        <DemoTourOverlay
          active={active}
          audioBlocked={audioBlocked}
          canContinue={canContinue}
          completedSet={completedSet}
          highlight={highlight}
          isOnRoute={isOnRoute}
          mode={mode}
          practiceDone={practiceDone}
          progressPct={progressPct}
          stepIndex={stepIndex}
          onBack={() => goToStep(stepIndex - 1)}
          onContinue={next}
          onExit={stop}
          onReplay={replayAudio}
          onSkipPractice={skipPractice}
        />
      )}
    </>
  );
}

function DemoTourOverlay({
  audioBlocked,
  canContinue,
  completedSet,
  highlight,
  isOnRoute,
  mode,
  practiceDone,
  progressPct,
  stepIndex,
  onBack,
  onContinue,
  onExit,
  onReplay,
  onSkipPractice,
}: {
  active: boolean;
  audioBlocked: boolean;
  canContinue: boolean;
  completedSet: Set<string>;
  highlight: HighlightRect | null;
  isOnRoute: boolean;
  mode: DemoTourMode;
  practiceDone: boolean;
  progressPct: number;
  stepIndex: number;
  onBack: () => void;
  onContinue: () => void;
  onExit: () => void;
  onReplay: () => void;
  onSkipPractice: () => void;
}) {
  const step = DEMO_TOUR_STEPS[stepIndex] ?? DEMO_TOUR_STEPS[0]!;
  const isFinal = stepIndex === DEMO_TOUR_STEPS.length - 1;
  const hasPractice = Boolean(step.practicePrompt);

  return (
    <>
      <div className="pointer-events-none fixed inset-0 z-[70]">
        {highlight && (
          <>
            <div className="absolute left-0 top-0 bg-black/35" style={{ width: "100%", height: highlight.top }} />
            <div className="absolute left-0 bg-black/35" style={{ top: highlight.top, width: highlight.left, height: highlight.height }} />
            <div
              className="absolute bg-black/35"
              style={{
                top: highlight.top,
                left: highlight.left + highlight.width,
                right: 0,
                height: highlight.height,
              }}
            />
            <div
              className="absolute left-0 bg-black/35"
              style={{ top: highlight.top + highlight.height, width: "100%", bottom: 0 }}
            />
            <div
              className="absolute rounded-lg border-2 border-[var(--ring)] shadow-[0_0_0_9999px_rgba(0,0,0,0.04)]"
              style={{
                top: highlight.top,
                left: highlight.left,
                width: highlight.width,
                height: highlight.height,
              }}
            />
          </>
        )}
      </div>

      <section className="fixed bottom-4 left-4 right-4 z-[80] mx-auto max-w-3xl rounded-lg border border-[var(--border)] bg-[var(--card)] shadow-2xl">
        <div className="h-1 rounded-t-lg bg-[var(--muted)]">
          <div className="h-1 rounded-t-lg bg-[var(--primary)] transition-all" style={{ width: `${progressPct}%` }} />
        </div>
        <div className="grid gap-4 p-4 md:grid-cols-[1fr_220px]">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-[var(--border)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-text-tertiary">
                ÑIGO demo
              </span>
              <span className="rounded-full bg-[var(--secondary)] px-2 py-0.5 text-[10px] font-medium uppercase text-[var(--secondary-foreground)]">
                {mode}
              </span>
              <span className="text-[11px] text-text-tertiary">
                Step {stepIndex + 1} of {DEMO_TOUR_STEPS.length} · {step.section}
              </span>
              {!isOnRoute && (
                <span className="inline-flex items-center gap-1 text-[11px] text-text-tertiary">
                  <PauseCircle className="h-3 w-3" /> Opening screen...
                </span>
              )}
            </div>
            <h2 className="text-base font-semibold tracking-tight text-text-primary">{step.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-text-secondary">{step.narration}</p>
            <p className="mt-2 border-l-2 border-[var(--primary)] pl-3 text-[13px] leading-relaxed text-text-tertiary">
              {step.objective}
            </p>

            {hasPractice && (
              <div className="mt-3 rounded-md border border-[var(--border)] bg-[var(--surface)] p-3">
                <div className="mb-1 flex items-center gap-1.5 text-[12px] font-medium text-text-secondary">
                  {practiceDone ? <CheckCircle2 className="h-3.5 w-3.5 text-[var(--green-text)]" /> : <Flag className="h-3.5 w-3.5 text-[var(--blue-text)]" />}
                  Practice checkpoint
                </div>
                <p className="text-[13px] leading-relaxed text-text-secondary">{step.practicePrompt}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {practiceDone ? (
                    <span className="text-[11px] text-[var(--green-text)]">Action detected. Ready to continue.</span>
                  ) : (
                    <Button type="button" size="sm" variant="ghost" onClick={onSkipPractice}>
                      Skip practice
                    </Button>
                  )}
                </div>
              </div>
            )}

            {audioBlocked && (
              <p className="mt-2 text-[11px] text-text-tertiary">
                Browser blocked autoplay. Use replay after interacting with the page.
              </p>
            )}
          </div>

          <div className="flex flex-col justify-between gap-3">
            <div className="grid grid-cols-5 gap-1">
              {DEMO_TOUR_STEPS.map((item, index) => (
                <span
                  key={item.id}
                  title={item.title}
                  className={`h-1.5 rounded-full ${
                    index === stepIndex
                      ? "bg-[var(--primary)]"
                      : completedSet.has(item.id)
                        ? "bg-[var(--green-mid)]"
                        : "bg-[var(--border)]"
                  }`}
                />
              ))}
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={onExit}>
                <X className="h-3.5 w-3.5" /> Exit
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={onReplay}>
                <Volume2 className="h-3.5 w-3.5" /> Replay
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={onBack} disabled={stepIndex === 0}>
                <ArrowLeft className="h-3.5 w-3.5" /> Back
              </Button>
              <Button type="button" size="sm" onClick={onContinue} disabled={!canContinue}>
                {isFinal ? (
                  <>
                    <RotateCcw className="h-3.5 w-3.5" /> Finish
                  </>
                ) : (
                  <>
                    <Play className="h-3.5 w-3.5" /> Continue <ArrowRight className="h-3.5 w-3.5" />
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
