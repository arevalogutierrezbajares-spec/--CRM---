import "server-only";

import { and, desc, eq, isNotNull, or } from "drizzle-orm";
import { db, schema } from "@/db";
import {
  deriveLinkageChips,
  type LinkageChip,
  type PlatformLinkage,
} from "@/lib/partner-access/platform-linkage";

export type LinkedPartnerRoomRow = PlatformLinkage & {
  id: string;
  name: string;
  updatedAt: Date | null;
  chips: LinkageChip[];
};

/**
 * Partner rooms with any platform-linkage fields set — for the Platforms hub
 * live connection overview (CRM view of CaneyCloud ↔ VAV wiring).
 */
export async function listPlatformLinkedRooms(
  workspaceId: string,
  limit = 24,
): Promise<LinkedPartnerRoomRow[]> {
  const rows = await db
    .select({
      id: schema.partnerRooms.id,
      name: schema.partnerRooms.name,
      caneyTenantId: schema.partnerRooms.caneyTenantId,
      caneyPropertyId: schema.partnerRooms.caneyPropertyId,
      vavPmsPropertyId: schema.partnerRooms.vavPmsPropertyId,
      vavListingId: schema.partnerRooms.vavListingId,
      caneyOnboardingStatus: schema.partnerRooms.caneyOnboardingStatus,
      updatedAt: schema.partnerRooms.updatedAt,
    })
    .from(schema.partnerRooms)
    .where(
      and(
        eq(schema.partnerRooms.workspaceId, workspaceId),
        or(
          isNotNull(schema.partnerRooms.caneyTenantId),
          isNotNull(schema.partnerRooms.caneyPropertyId),
          isNotNull(schema.partnerRooms.vavPmsPropertyId),
          isNotNull(schema.partnerRooms.vavListingId),
          isNotNull(schema.partnerRooms.caneyOnboardingStatus),
        ),
      ),
    )
    .orderBy(desc(schema.partnerRooms.updatedAt))
    .limit(limit);

  return rows.map((r) => {
    const link: PlatformLinkage = {
      caneyTenantId: r.caneyTenantId,
      caneyPropertyId: r.caneyPropertyId,
      vavPmsPropertyId: r.vavPmsPropertyId,
      vavListingId: r.vavListingId,
      caneyOnboardingStatus: r.caneyOnboardingStatus,
    };
    return {
      ...link,
      id: r.id,
      name: r.name,
      updatedAt: r.updatedAt,
      chips: deriveLinkageChips(link),
    };
  });
}
