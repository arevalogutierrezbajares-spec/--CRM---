export type PitchFeedbackPromptType =
  | "reaction"
  | "score"
  | "text"
  | "intro"
  | "objection"
  | "final";

export type PitchFeedbackPrompt = {
  key: string;
  label: string;
  type: PitchFeedbackPromptType;
  required?: boolean;
};

export type PitchFeedbackSection = {
  key: string;
  eyebrow?: string;
  title: string;
  body: string;
  proof?: string;
  prompts: PitchFeedbackPrompt[];
};

export type PitchFeedbackPersonalization = {
  welcomeNote?: string;
  sendMessage?: string;
  focusQuestions?: string[];
};

export type PitchFeedbackResponseInput = {
  promptKey: string;
  responseType: PitchFeedbackPromptType;
  value: Record<string, unknown>;
};

export type PitchFeedbackInsightDraft = {
  model: string;
  summary: string;
  sentiment: "positive" | "neutral" | "mixed" | "negative";
  confidenceScore: number;
  supportLevel: "champion" | "supportive" | "curious" | "skeptical" | "disengaged";
  objections: string[];
  confusionPoints: string[];
  positiveSignals: string[];
  recommendedFollowup: string;
  suggestedPitchEdits: Array<{ sectionKey?: string; suggestion: string }>;
};
