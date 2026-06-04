import type { PostView } from "@/db/queries/town-hall";

export type MemberOption = { userId: string; displayName: string };

export type RefObject = {
  refType: "action_item" | "milestone" | "meeting" | "project" | "doc";
  refId: string;
  label: string;
  /** Where a #ref of this object links to. */
  href: string;
};

export type { PostView };

/** href for a saved post ref, used when rendering the feed. */
export function refHref(refType: RefObject["refType"], refId: string): string {
  switch (refType) {
    case "project":
      return `/projects/${refId}`;
    case "milestone":
      return `/work`;
    case "meeting":
      return `/meetings/${refId}`;
    case "action_item":
      return `/action-items`;
    case "doc":
      return `/projects?doc=${refId}`;
    default:
      return "#";
  }
}
