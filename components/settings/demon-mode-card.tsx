"use client";

import { useEffect, useState } from "react";
import { Flame, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DEMON_MODE_ENABLED_KEY,
  DEMON_MODE_INTENSITIES,
  DEMON_MODE_INTENSITY_KEY,
  DEMON_MODE_SETTINGS_EVENT,
  DEMON_MODE_TEST_EVENT,
  demonModeIntensity,
  type DemonModeIntensity,
} from "@/lib/jarvis-voice";

export function DemonModeCard() {
  const [enabled, setEnabled] = useState(false);
  const [intensity, setIntensity] = useState<DemonModeIntensity>("normal");

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      try {
        setEnabled(localStorage.getItem(DEMON_MODE_ENABLED_KEY) === "1");
        setIntensity(demonModeIntensity(localStorage.getItem(DEMON_MODE_INTENSITY_KEY)).value);
      } catch {
        /* ignore */
      }
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  function publishChange() {
    window.dispatchEvent(new CustomEvent(DEMON_MODE_SETTINGS_EVENT));
  }

  function toggleEnabled() {
    const next = !enabled;
    setEnabled(next);
    try {
      localStorage.setItem(DEMON_MODE_ENABLED_KEY, next ? "1" : "0");
    } catch {
      /* ignore */
    }
    publishChange();
  }

  function changeIntensity(value: DemonModeIntensity) {
    setIntensity(value);
    try {
      localStorage.setItem(DEMON_MODE_INTENSITY_KEY, value);
    } catch {
      /* ignore */
    }
    publishChange();
  }

  function testMessage() {
    window.dispatchEvent(new CustomEvent(DEMON_MODE_TEST_EVENT));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Flame className="h-4 w-4 text-[var(--red-text)]" aria-hidden="true" />
          ÑIGO DEMON mode
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <label className="flex cursor-pointer items-center justify-between gap-3 text-sm">
          <span className="min-w-0">
            <span className="block font-medium text-text-secondary">Enable random ÑIGO audio</span>
            <span className="block text-xs text-text-tertiary">ÑIGO intro, then approved message clips.</span>
          </span>
          <input
            type="checkbox"
            checked={enabled}
            onChange={toggleEnabled}
            className="h-4 w-4 shrink-0 cursor-pointer accent-[var(--red-text)]"
          />
        </label>

        <label className="flex items-center justify-between gap-3 text-sm">
          <span className="text-text-secondary">Intensity</span>
          <select
            value={intensity}
            onChange={(e) => changeIntensity(e.target.value as DemonModeIntensity)}
            className="h-8 rounded border bg-transparent px-2 text-sm outline-none"
            style={{ borderColor: "var(--border-default)" }}
          >
            {DEMON_MODE_INTENSITIES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <Button type="button" variant="outline" size="sm" onClick={testMessage}>
          <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
          Test message
        </Button>
      </CardContent>
    </Card>
  );
}
