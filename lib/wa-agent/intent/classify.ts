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
  | "draft_send"
  | "add_channel"
  | "log_meeting"
  | "meeting_brief"
  | "assign_contact"
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

  // Todo / action items / priorities / "what's next"
  [
    /\b(todos?|action items?|to-?do list?|task list?|what'?s on my list|pending (tasks?|items?)|open items?|what should i (focus on|work on|do)|what'?s next|priorities|focus today|my priorities|what are my priorities)\b/i,
    "todo_query",
  ],

  // Reminder cancel — must come before reminder_set (both match "reminder")
  [/\b(cancel( the| my| a)? reminder|delete( the| my| a)? reminder|remove( the| my| a)? reminder|drop( the| my| a)? reminder)\b/i, "reminder_cancel"],

  // Reminder set
  [
    /\b(remind me|set (a )?reminder|reminder for|remind (me )?(at|on|in|tomorrow|next|this)|schedule (a )?reminder)\b/i,
    "reminder_set",
  ],

  // Reminder list
  [
    /\b(my reminders?|(list|show|what are( my)?|what) reminders?( do i have)?|upcoming reminders?|what'?s? (coming up|scheduled))\b/i,
    "reminder_list",
  ],

  // Draft & send — before touch_log ("send" could fire there)
  [
    /\b(draft (a |an )?(message|email|whatsapp|note|outreach)|write (a |an )?(message|email)|send (a |an )?(message|email|whatsapp) to|message (them|him|her)|reach out to .+ (via|by|on|through))\b/i,
    "draft_send",
  ],

  // Add channel
  [
    /\b(add (their |his |her )?(email|phone|number|whatsapp|instagram|contact|channel)|update (their |his |her )?(email|phone|number|whatsapp))\b/i,
    "add_channel",
  ],

  // Meeting brief — before log_meeting and touch_log to avoid shadowing
  [
    /\b(brief me (on|about)|prep (me )?(for (the )?)?meeting|what do i know about .+ before|background on .+ for|pre-?meeting( brief| prep)?)\b/i,
    "meeting_brief",
  ],

  // Log meeting — before touch_log ("had a meeting with" fires touch_log otherwise)
  [
    /\b(log (a |the )?meeting|had (a |the )?meeting with|we met (with)?|i met with|schedule (a |the )?meeting|meeting with .+ (today|yesterday|this morning|this afternoon|earlier|on))\b/i,
    "log_meeting",
  ],

  // Touch log — after log_meeting so "had a meeting" doesn't land here
  [
    /\b(log( a)? (call|touch|email|message|conversation)|talked to|spoke with|met with|had (a )?(call|chat) with|connected with)\b/i,
    "touch_log",
  ],

  // Assign contact
  [
    /\b(assign|you take|joe take|tomas take|hand off|give .+ to (joe|tomas|me)|delegate)\b/i,
    "assign_contact",
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

// ── Spanish patterns (added after English so they don't shadow) ──────────────
const SPANISH_PATTERNS: Array<[RegExp, Intent]> = [
  [/^\s*(sí|si|dale|claro|confirma(do)?|adelante|va|ok(ey)?|perfecto|de acuerdo)\s*[.!]?\s*$/i, "confirmation"],
  [/^\s*(no|cancel(a|ar)?|para|olvida(lo)?|detén)\s*[.!]?\s*$/i, "confirmation"],
  [/\b(resumen|recuento|recap|cómo (fue|estuvo|salió)|qué pasó hoy|resúmeme)\b/i, "recap"],
  [/\b(pon(me)?|agrega|crea|añade) (un |una )?(nota|apunte)/i, "note_write"],
  [/\b(mis (pendientes|tareas|to-?dos?)|qué (tengo|hay) (pendiente|por hacer)|lista de tareas|en qué (debo|tengo que) enfocarme|qué hago primero|mis prioridades|qué sigue)\b/i, "todo_query"],
  [/\b(ponme|pon|agrega|crea|añade) (un |una )?(recordatorio|aviso|alarma)/i, "reminder_set"],
  [/\b(mis recordatorios|ver recordatorios|qué recordatorios)\b/i, "reminder_list"],
  [/\b(redacta(me)?|escríbe(me)?|prepara(me)?) (un |una )?(mensaje|email|correo|whatsapp)/i, "draft_send"],
  [/\b(envía|manda|mandá|envíale) (un |una )?(mensaje|email|correo|whatsapp) (a|para)\b/i, "draft_send"],
  // Log meeting before touch_log (both match "reunión")
  [/\b(tuve|hubo|registra|log(ea)?) (una? )?(reunión|meeting|junta)\b/i, "log_meeting"],
  [/\b(registra|anota|log(ea)?|apunta) (una? )?(llamada|email|mensaje|conversación)/i, "touch_log"],
  [/\b(hablé con|llamé a|me reuní con|tuve (una )?llamada con)\b/i, "touch_log"],
  [/\b(asigna(le)?|dale a|que (joe|tomas|yo) (tome|maneje|contacte))\b/i, "assign_contact"],
  [/\b(agreg(a|ar|ue)|añad(e|ir)) (el |la |su )?(teléfono|número|email|correo|whatsapp|instagram)\b/i, "add_channel"],
  [/\b(cuéntame|dame info|prepárame|briefing|antecedentes) (sobre|de|del|para)\b/i, "meeting_brief"],
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

  // Try Spanish patterns
  for (const [pattern, intent] of SPANISH_PATTERNS) {
    if (pattern.test(trimmed)) {
      if (intent === "confirmation") {
        const isYes = /^\s*(sí|si|dale|claro|confirma|adelante|va\b|ok|perfecto|de acuerdo)/i.test(trimmed);
        return { intent, confidence: "high", isConfirmYes: isYes };
      }
      return { intent, confidence: "high" };
    }
  }

  return { intent: "unknown", confidence: "low" };
}
