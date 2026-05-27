/**
 * Lightweight regex-based intent classifier.
 * Runs before the LLM so the loop can gate tools and inject supplements
 * without burning tokens on a classification call.
 */

export type Intent =
  | "recap"
  | "note_write"
  | "contact_add"
  | "contact_find"
  | "todo_query"
  | "reminder_set"
  | "reminder_list"
  | "reminder_cancel"
  | "touch_log"
  | "status_check"
  | "milestone_done"
  | "confirmation"
  | "unknown";

export type Classification = {
  intent: Intent;
  confidence: "high" | "low";
  isConfirmYes?: boolean; // only set when intent === 'confirmation'
};

// Order matters: first match wins.
const PATTERNS: Array<[RegExp, Intent]> = [
  // Confirmation (yes/no) must come first so short "yes" doesn't hit other patterns
  [
    /^\s*(yes|yep|yeah|yup|confirm(ed)?|go ahead|do it|ok(ay)?|sure|absolutely|sounds good|proceed|make it happen)\s*[.!]?\s*$/i,
    "confirmation",
  ],
  [
    /^\s*(no|nope|nah|cancel(led)?|stop|don'?t|abort|never mind|skip|forget it|hold off)\s*[.!]?\s*$/i,
    "confirmation",
  ],

  // Recap / daily summary
  [
    /\b(recap|summary|today'?s? wins?|what (happened|did we do)|daily (recap|summary|report)|how did (we|i|the team) do)\b/i,
    "recap",
  ],

  // Note writing
  [
    /\b(note that|write (a |this )?note|add (a )?note|jot (this |that )?down|note:|remember( this| that)?|make a note)\b/i,
    "note_write",
  ],

  // Contact add
  [
    /\b(add (a |new )?(contact|person|company|lead)|create (a |new )?contact|new (lead|contact|person))\b/i,
    "contact_add",
  ],

  // Contact find
  [/\b(find|look up|search( for)?|who is|pull up|get( me)? (info|details) (on|about))\b/i, "contact_find"],

  // Todo / action items
  [
    /\b(todos?|action items?|to-?do list?|task list?|what'?s on my list|pending (tasks?|items?)|open items?)\b/i,
    "todo_query",
  ],

  // Reminder cancel — must come before reminder_set (both match "reminder")
  [/\b(cancel( the)? reminder|delete( the)? reminder|remove reminder|drop( the)? reminder)\b/i, "reminder_cancel"],

  // Reminder set
  [
    /\b(remind me|set (a )?reminder|reminder for|remind (me )?(at|on|in|tomorrow|next|this)|schedule (a )?reminder)\b/i,
    "reminder_set",
  ],

  // Reminder list
  [
    /\b(my reminders?|(list|show|what are( my)?) reminders?|upcoming reminders?|what'?s? (coming up|scheduled))\b/i,
    "reminder_list",
  ],

  // Touch log
  [
    /\b(log( a)? (call|meeting|touch|email|message|conversation)|talked to|spoke with|met with|had (a )?(call|meeting|chat) with|connected with)\b/i,
    "touch_log",
  ],

  // Milestone done — must come before status_check ("milestone" alone fires status_check)
  [
    /\b(mark\b.+\bdone\b|mark (as |it )?done|mark\b.+\bcomplete(d)?\b|milestone done|close( out)?)\b/i,
    "milestone_done",
  ],

  // Status check
  [
    /\b(status (of|for|report)|project status|how is .+ (going|doing)|milestone|progress (on|for)|what'?s (up with|the status))\b/i,
    "status_check",
  ],
];

export function classifyIntent(body: string): Classification {
  const trimmed = body.trim();

  for (const [pattern, intent] of PATTERNS) {
    if (pattern.test(trimmed)) {
      if (intent === "confirmation") {
        const isYes = /^\s*(yes|yep|yeah|yup|confirm|go ahead|do it|ok|okay|sure|absolutely|sounds good|proceed|make it happen)/i.test(trimmed);
        return { intent, confidence: "high", isConfirmYes: isYes };
      }
      return { intent, confidence: "high" };
    }
  }

  return { intent: "unknown", confidence: "low" };
}
