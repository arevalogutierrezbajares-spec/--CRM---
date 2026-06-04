import { ALL_NAV_LEAVES, type NavLeaf } from "./nav-groups";

export type NavItem = NavLeaf;

/**
 * Flat list of every nav destination — derived from the grouped sidebar config
 * (nav-groups.ts) so the ⌘K palette and mobile nav never drift from the
 * sidebar. Edit destinations in nav-groups.ts, not here.
 */
export const NAV_ITEMS: NavItem[] = ALL_NAV_LEAVES;
