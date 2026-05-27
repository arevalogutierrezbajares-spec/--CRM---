import { describe, it, expect } from "vitest";
import { classifyIntent } from "@/lib/wa-agent/intent/classify";

describe("intent classifier — English", () => {
  // Recap
  it.each([
    "recap me on today",
    "recap today's wins",
    "what happened today",
    "daily recap",
    "give me a summary",
  ])('"%s" → recap', (msg) => {
    expect(classifyIntent(msg).intent).toBe("recap");
  });

  // Note write
  it.each([
    "note that Marcus is interested",
    "write a note on Anabella",
    "jot this down",
    "make a note",
  ])('"%s" → note_write', (msg) => {
    expect(classifyIntent(msg).intent).toBe("note_write");
  });

  // Contact add
  it.each([
    "add a new contact: Sofia Chen",
    "create contact Oscar Pietri",
    "new lead from the meeting",
  ])('"%s" → contact_add', (msg) => {
    expect(classifyIntent(msg).intent).toBe("contact_add");
  });

  // Contact find
  it.each([
    "find Juan Carlos",
    "look up Anabella",
    "who is Oscar Pietri",
    "search for Marcos",
  ])('"%s" → contact_find', (msg) => {
    expect(classifyIntent(msg).intent).toBe("contact_find");
  });

  // Todo query
  it.each([
    "what are my todos",
    "action items",
    "what's on my list",
    "pending tasks",
    "open items",
  ])('"%s" → todo_query', (msg) => {
    expect(classifyIntent(msg).intent).toBe("todo_query");
  });

  // Reminder cancel (before reminder_set)
  it.each([
    "cancel the reminder for Monday",
    "delete my reminder",
    "remove the reminder",
  ])('"%s" → reminder_cancel', (msg) => {
    expect(classifyIntent(msg).intent).toBe("reminder_cancel");
  });

  // Reminder set
  it.each([
    "remind me tomorrow at 9am to call Marcos",
    "set a reminder for next Monday",
    "schedule a reminder for Friday",
  ])('"%s" → reminder_set', (msg) => {
    expect(classifyIntent(msg).intent).toBe("reminder_set");
  });

  // Reminder list
  it.each([
    "my reminders",
    "list my reminders",
    "show reminders",
    "what reminders do I have",
  ])('"%s" → reminder_list', (msg) => {
    expect(classifyIntent(msg).intent).toBe("reminder_list");
  });

  // Touch log
  it.each([
    "log a call with Anabella",
    "talked to Oscar",
    "spoke with Juan Carlos",
    "connected with La Guaquira",
  ])('"%s" → touch_log', (msg) => {
    expect(classifyIntent(msg).intent).toBe("touch_log");
  });

  // Milestone done
  it.each([
    "mark the intro phase done",
    "mark milestone as done",
    "mark it done",
    "milestone done",
  ])('"%s" → milestone_done', (msg) => {
    expect(classifyIntent(msg).intent).toBe("milestone_done");
  });

  // Status check
  it.each([
    "status of the Margarita project",
    "project status",
    "progress on the deal",
    "how is the project going",
  ])('"%s" → status_check', (msg) => {
    expect(classifyIntent(msg).intent).toBe("status_check");
  });

  // Draft & send
  it.each([
    "draft a WhatsApp to Anabella",
    "write a message to Oscar",
    "send an email to Marcos",
    "reach out to Oscar via email",
  ])('"%s" → draft_send', (msg) => {
    expect(classifyIntent(msg).intent).toBe("draft_send");
  });

  // Add channel
  it.each([
    "add their email oscar@laguaquira.com",
    "add his phone number",
    "add her WhatsApp",
    "update their email",
  ])('"%s" → add_channel', (msg) => {
    expect(classifyIntent(msg).intent).toBe("add_channel");
  });

  // Log meeting
  it.each([
    "log a meeting with Marcos",
    "had a meeting with the team",
    "we met yesterday",
    "I met with Anabella this morning",
  ])('"%s" → log_meeting', (msg) => {
    expect(classifyIntent(msg).intent).toBe("log_meeting");
  });

  // Meeting brief
  it.each([
    "brief me on Marcos before my 3pm",
    "prep me for the meeting",
    "background on Anabella for our call",
  ])('"%s" → meeting_brief', (msg) => {
    expect(classifyIntent(msg).intent).toBe("meeting_brief");
  });

  // Assign contact
  it.each([
    "assign Anabella to Joe",
    "Joe take this one",
    "delegate Oscar to Tomas",
    "hand off Juan Carlos to Joe",
  ])('"%s" → assign_contact', (msg) => {
    expect(classifyIntent(msg).intent).toBe("assign_contact");
  });

  // Confirmation YES
  it.each([
    ["yes", true],
    ["yep", true],
    ["go ahead", true],
    ["confirm", true],
    ["sure", true],
    ["no", false],
    ["nope", false],
    ["cancel", false],
    ["never mind", false],
  ] as [string, boolean][])('"%s" → confirmation (isYes=%s)', (msg, isYes) => {
    const r = classifyIntent(msg);
    expect(r.intent).toBe("confirmation");
    expect(r.isConfirmYes).toBe(isYes);
  });

  // Unknown
  it.each([
    "what's up bro",
    "hey",
    "👋",
  ])('"%s" → unknown', (msg) => {
    expect(classifyIntent(msg).intent).toBe("unknown");
  });
});

describe("intent classifier — Spanish", () => {
  it.each([
    ["sí", "confirmation"],
    ["si", "confirmation"],
    ["dale", "confirmation"],
    ["no", "confirmation"],
    ["cancela", "confirmation"],
    ["resumen del día", "recap"],
    ["resúmeme", "recap"],
    ["mis pendientes", "todo_query"],
    ["qué tengo pendiente", "todo_query"],
    ["ponme un recordatorio para mañana", "reminder_set"],
    ["mis recordatorios", "reminder_list"],
    ["registra una llamada con Oscar", "touch_log"],
    ["hablé con Anabella", "touch_log"],
    ["redacta un mensaje para Marcos", "draft_send"],
    ["envíale un email a Oscar", "draft_send"],
    ["tuve una reunión con el equipo", "log_meeting"],
    ["asigna a Anabella a Joe", "assign_contact"],
    ["agrega su email", "add_channel"],
    ["dame info sobre Marcos para la reunión", "meeting_brief"],
  ] as [string, string][])('ES: "%s" → %s', (msg, expected) => {
    expect(classifyIntent(msg).intent).toBe(expected);
  });

  it("sí → confirmation YES", () => {
    const r = classifyIntent("sí");
    expect(r.intent).toBe("confirmation");
    expect(r.isConfirmYes).toBe(true);
  });

  it("no → confirmation NO", () => {
    const r = classifyIntent("no");
    expect(r.intent).toBe("confirmation");
    expect(r.isConfirmYes).toBe(false);
  });
});
