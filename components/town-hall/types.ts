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
      // Deep-link home to auto-open the task's detail drawer.
      return `/?item=milestone:${refId}`;
    case "meeting":
      return `/meetings/${refId}`;
    case "action_item":
      return `/?item=action_item:${refId}`;
    case "doc":
      return `/projects?doc=${refId}`;
    default:
      return "#";
  }
}
