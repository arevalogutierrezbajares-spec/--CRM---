/**
 * Tool registry. Adding a new tool is a single line below + a new file in this
 * folder. The agent loop introspects TOOLS to compute TOOL_DEFINITIONS (sent to
 * Claude) and to resolve tool names → executors at call time.
 */
import type { ClaudeToolDef } from "@/lib/anthropic";
import type { ToolContext, ToolEntry, ToolResult } from "./_types";

import { findContact } from "./find-contact";
import { createContact } from "./create-contact";
import { logTouch } from "./log-touch";
import { contactSummary } from "./contact-summary";
import { findProject } from "./find-project";
import { markMilestoneDone } from "./mark-milestone-done";
import { statusReport } from "./status-report";
import { scheduleReminder } from "./schedule-reminder";
import { listReminders } from "./list-reminders";
import { cancelReminder } from "./cancel-reminder";
import { dailyRecap } from "./daily-recap";
import { upsertNote } from "./upsert-note";
import { proposeAddContact } from "./propose-add-contact";
import { readTodoBoard } from "./read-todo-board";
// Wave A — communication + collaboration tools
import { addChannel } from "./add-channel";
import { draftMessage } from "./draft-message";
import { sendMessage } from "./send-message";
import { logMeeting } from "./log-meeting";
import { meetingBrief } from "./meeting-brief";
import { assignContact } from "./assign-contact";
import { attachLink } from "./attach-link";
import { addActionItem } from "./add-action-item";
import { editActionItem } from "./edit-action-item";
import { editTask } from "./edit-task";
import { findMember } from "./find-member";
import { postToTownHall } from "./post-to-townhall";
import { fileEnhancement } from "./file-enhancement";
// Partner rooms — create, fill, polish, and share branded partner microsites
import { createPartnerRoom } from "./create-partner-room";
import { partnerRoomOverview } from "./partner-room-overview";
import { addRoomDocuments } from "./add-room-documents";
import { addRoomLink } from "./add-room-link";
import { updatePartnerRoom } from "./update-partner-room";
import { setRoomBranding } from "./set-room-branding";
import { addRoomNextStep } from "./add-room-next-step";
import { getRoomLink } from "./get-room-link";
import { uploadRoomFile } from "./upload-room-file";
import { uploadRoomLogo } from "./upload-room-logo";
import { listDemos } from "./list-demos";
import { featureRoomDemo } from "./feature-room-demo";
// VAV white-label storefront control plane (Phase 0–2)
import { createStorefrontRequest } from "./create-storefront-request";
import { listStorefrontQueue } from "./list-storefront-queue";
import { generateStorefrontDraft } from "./generate-storefront-draft";
import { getStorefrontPreviewLink } from "./get-storefront-preview-link";
import { brainSearch } from "./brain-search";
import { brainNeighborhood } from "./brain-neighborhood";
import { brainDocGet } from "./brain-doc-get";
import { brainFreshnessTool } from "./brain-freshness";
import { brainRcaPack } from "./brain-rca-pack";
import { brainRemediationGate } from "./brain-remediation-gate";
import { brainCorrelateError } from "./brain-correlate-error";

export const TOOLS: Record<string, ToolEntry> = {
  find_contact: findContact,
  create_contact: createContact,
  log_touch: logTouch,
  contact_summary: contactSummary,
  find_project: findProject,
  mark_milestone_done: markMilestoneDone,
  status_report: statusReport,
  schedule_reminder: scheduleReminder,
  list_reminders: listReminders,
  cancel_reminder: cancelReminder,
  daily_recap: dailyRecap,
  upsert_note: upsertNote,
  propose_add_contact: proposeAddContact,
  read_todo_board: readTodoBoard,
  // Wave A
  add_channel: addChannel,
  draft_message: draftMessage,
  send_message: sendMessage,
  log_meeting: logMeeting,
  meeting_brief: meetingBrief,
  assign_contact: assignContact,
  attach_link: attachLink,
  add_action_item: addActionItem,
  edit_action_item: editActionItem,
  edit_task: editTask,
  find_member: findMember,
  post_to_townhall: postToTownHall,
  file_enhancement: fileEnhancement,
  // Partner rooms
  create_partner_room: createPartnerRoom,
  partner_room_overview: partnerRoomOverview,
  add_room_documents: addRoomDocuments,
  add_room_link: addRoomLink,
  update_partner_room: updatePartnerRoom,
  set_room_branding: setRoomBranding,
  add_room_next_step: addRoomNextStep,
  get_partner_room_link: getRoomLink,
  upload_room_file: uploadRoomFile,
  upload_room_logo: uploadRoomLogo,
  list_demos: listDemos,
  feature_room_demo: featureRoomDemo,
  // VAV storefront (Phase 0–2)
  create_storefront_request: createStorefrontRequest,
  list_storefront_queue: listStorefrontQueue,
  generate_storefront_draft: generateStorefrontDraft,
  get_storefront_preview_link: getStorefrontPreviewLink,
  // Living Brain — rebuild-guard + RCA tools (deterministic, no LLM)
  brain_search: brainSearch,
  brain_neighborhood: brainNeighborhood,
  brain_doc_get: brainDocGet,
  brain_freshness: brainFreshnessTool,
  brain_rca_pack: brainRcaPack,
  brain_remediation_gate: brainRemediationGate,
  brain_correlate_error: brainCorrelateError,
};

export const TOOL_NAMES = Object.keys(TOOLS);

export const TOOL_DEFINITIONS: ClaudeToolDef[] = Object.values(TOOLS).map(
  (t) => t.definition,
);

export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolResult> {
  const tool = TOOLS[name];
  if (!tool) return { ok: false, error: `Unknown tool: ${name}` };
  try {
    return await tool.execute(input, ctx);
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export type { ToolContext, ToolEntry, ToolResult } from "./_types";
