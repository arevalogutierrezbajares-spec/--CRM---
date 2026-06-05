"use client";

import { MonitorPlay, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DEMO_TOUR_ACTIVE_KEY,
  DEMO_TOUR_COMPLETED_KEY,
  DEMO_TOUR_MODE_KEY,
  DEMO_TOUR_START_EVENT,
  DEMO_TOUR_STEP_KEY,
  type DemoTourMode,
} from "@/lib/demo-tour";

function startTour(mode: DemoTourMode) {
  window.dispatchEvent(new CustomEvent(DEMO_TOUR_START_EVENT, { detail: { mode } }));
}

function resetTour() {
  try {
    localStorage.removeItem(DEMO_TOUR_ACTIVE_KEY);
    localStorage.removeItem(DEMO_TOUR_MODE_KEY);
    localStorage.removeItem(DEMO_TOUR_STEP_KEY);
    localStorage.removeItem(DEMO_TOUR_COMPLETED_KEY);
  } catch {
    /* ignore */
  }
  startTour("guided");
}

export function DemoTourCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MonitorPlay className="h-4 w-4 text-[var(--blue-text)]" aria-hidden="true" />
          ÑIGO guided demo
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm leading-relaxed text-text-secondary">
          Walk through the platform from mission objective to daily execution,
          planning, projects, and materials. ÑIGO narrates and pauses for
          practice steps.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" onClick={() => startTour("guided")}>
            Start guided overview
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => startTour("practice")}>
            Practice workflows
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => startTour("presentation")}>
            Presentation mode
          </Button>
        </div>
        <Button type="button" size="sm" variant="ghost" onClick={resetTour}>
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          Reset and restart
        </Button>
      </CardContent>
    </Card>
  );
}
