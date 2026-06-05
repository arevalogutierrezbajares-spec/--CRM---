import { describe, expect, it } from "vitest";
import {
  DEMO_TOUR_AGENT_REPLIED_EVENT,
  DEMO_TOUR_FILE_UPLOADED_EVENT,
  DEMO_TOUR_STEPS,
  DEMO_TOUR_TOWN_HALL_POSTED_EVENT,
  demoTourAudioSrc,
  demoTourStepIndex,
  demoTourWaitEvent,
} from "@/lib/demo-tour";

describe("demo tour registry", () => {
  it("has unique step ids and starts/ends on mission framing", () => {
    const ids = DEMO_TOUR_STEPS.map((step) => step.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(DEMO_TOUR_STEPS[0]?.id).toBe("mission-frame");
    expect(DEMO_TOUR_STEPS.at(-1)?.id).toBe("closing");
  });

  it("includes the required day-to-day and setup routes", () => {
    const routes = new Set(DEMO_TOUR_STEPS.map((step) => step.route));
    for (const route of ["/", "/town-hall", "/inbox", "/work", "/agent", "/priorities", "/sprint", "/pipeline", "/projects", "/settings"]) {
      expect(routes.has(route)).toBe(true);
    }
  });

  it("maps audio and wait events consistently", () => {
    expect(demoTourAudioSrc("mission-frame")).toBe("/demo-tour/mission-frame.mp3");
    expect(demoTourStepIndex("agent-copilot")).toBeGreaterThan(0);
    expect(demoTourStepIndex("missing")).toBe(0);
    expect(demoTourWaitEvent("town-hall-posted")).toBe(DEMO_TOUR_TOWN_HALL_POSTED_EVENT);
    expect(demoTourWaitEvent("agent-replied")).toBe(DEMO_TOUR_AGENT_REPLIED_EVENT);
    expect(demoTourWaitEvent("file-uploaded")).toBe(DEMO_TOUR_FILE_UPLOADED_EVENT);
  });
});
