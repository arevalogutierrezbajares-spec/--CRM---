import {
  getPartnerAccessRoom,
  listShareableDocsForRoom,
  resolveRoomBrandLogos,
} from "@/db/queries/partner-access";
import { listPartnerNextStepsByRoom } from "@/db/queries/partner-next-steps";
import { listRoomItems } from "@/db/queries/partner-repository";
import { ROOM_HERO_VIDEOS, roomHeroVideo } from "@/lib/partner-room-videos";
import { ROOM_HERO_PHOTO_SETS, roomHeroPhotoSet } from "@/lib/partner-room-photos";
import {
  HERO_IMAGE_THEMES,
  heroImageTheme,
  roomHeroImageUrl,
} from "@/lib/partner-room-hero-images";
import type { ToolEntry } from "./_types";
import { ROOM_REF_PROPS, absUrl, resolveRoomRef, roomAdminUrl } from "./_partner-room";

type ChecklistEntry = {
  item: string;
  done: boolean;
  fix?: string;
};

export const partnerRoomOverview: ToolEntry = {
  definition: {
    name: "partner_room_overview",
    description:
      "Full state of a partner room: contents (shared documents, links, next steps), " +
      "settings (status, passcode, welcome message), branding (client logo, brand logos, " +
      "hero video — with image URLs so they can be verified), engagement (guests, last " +
      "viewed), a setup checklist of what's still missing for a crisp room, and the " +
      "workspace documents available to add. Use this to walk through room setup step by " +
      "step, confirming the branding images with the user before the link is sent.",
    input_schema: {
      type: "object",
      properties: { ...ROOM_REF_PROPS },
    },
  },
  async execute(input, ctx) {
    const ref = await resolveRoomRef(ctx.workspaceId, input);
    if (!ref.ok) return ref;
    const roomId = ref.room.id;

    const [detail, items, nextSteps, shareable] = await Promise.all([
      getPartnerAccessRoom({ workspaceId: ctx.workspaceId, roomId }),
      listRoomItems({ roomId }),
      listPartnerNextStepsByRoom({ roomId }),
      listShareableDocsForRoom({ workspaceId: ctx.workspaceId, roomId }),
    ]);
    if (!detail) return { ok: false, error: "Room not found" };

    const { room } = detail;
    // Live = not revoked AND not past its expiry — the public room page hides
    // expired shares, so counting them here would report a room as ready
    // while the partner sees nothing.
    const liveShares = detail.shares.filter(
      (s) => !s.revokedAt && (!s.expiresAt || s.expiresAt.getTime() > ctx.now.getTime()),
    );
    const expiredShares = detail.shares.filter(
      (s) => !s.revokedAt && s.expiresAt && s.expiresAt.getTime() <= ctx.now.getTime(),
    );
    const availableDocs = shareable.filter((d) => !d.alreadyShared).slice(0, 40);
    const heroVideo = roomHeroVideo(room.heroVideoKey);
    const heroPhotos = roomHeroPhotoSet(room.heroVideoKey);
    const heroImageUrl = roomHeroImageUrl(room);
    const heroImageThemeInfo = heroImageTheme(room.heroImageTheme);
    const brandLogos = await resolveRoomBrandLogos({
      workspaceId: ctx.workspaceId,
      brandLobIds: room.brandLobIds,
      shares: liveShares,
    });

    const checklist: ChecklistEntry[] = [
      {
        item: "Documents shared",
        done: liveShares.length > 0,
        fix: "add_room_documents",
      },
      {
        item: "Welcome message",
        done: Boolean(room.welcomeMessage),
        fix: "update_partner_room (welcome_message)",
      },
      {
        item: "Room summary",
        done: Boolean(room.summary),
        fix: "update_partner_room (summary)",
      },
      {
        item: "Next steps for the partner",
        done: nextSteps.length > 0,
        fix: "add_room_next_step",
      },
      {
        item: "Room is live (active status)",
        done: room.status === "active",
        fix: "update_partner_room (status: active)",
      },
      {
        item: "Guest link issued",
        done: Boolean(room.publicAccessTokenHash),
        fix: "get_partner_room_link",
      },
      {
        item: "Client logo (co-brand lockup)",
        done: Boolean(detail.contact.logoUrl),
        fix: "set_room_branding (client_logo_url)",
      },
      {
        item: "Brand logos on the room",
        done: brandLogos.length > 0,
        fix: "set_room_branding (brand_projects) — or auto-derived once documents are shared",
      },
      {
        item: "Hero background video or photo set (optional)",
        done: Boolean(heroVideo || heroPhotos),
        fix: "set_room_branding (hero_video)",
      },
      {
        item: "Hero background image (optional, Grok-generated)",
        done: Boolean(heroImageUrl),
        fix: "set_room_branding (hero_image)",
      },
      {
        item: "Passcode protection (optional)",
        done: Boolean(room.passcodeHash),
        fix: "update_partner_room (passcode)",
      },
    ];

    return {
      ok: true,
      data: {
        room: {
          id: room.id,
          name: room.name,
          partnerKind: room.partnerKind,
          status: room.status,
          summary: room.summary,
          welcomeMessage: room.welcomeMessage,
          passcodeSet: Boolean(room.passcodeHash),
          seatLimit: room.seatLimit,
          expiresAt: room.expiresAt,
          lastViewedAt: room.publicAccessLastViewedAt,
          adminUrl: roomAdminUrl(room.id),
        },
        contact: detail.contact,
        branding: {
          clientLogoUrl: absUrl(detail.contact.logoUrl),
          brandLogos: brandLogos.map((b) => ({
            project: b.title,
            logoUrl: absUrl(b.logoUrl),
          })),
          brandLogoMode: room.brandLobIds?.length ? "explicit" : "auto",
          heroVideo: heroVideo
            ? { key: heroVideo.key, label: heroVideo.label, posterUrl: absUrl(heroVideo.poster) }
            : null,
          heroPhotoSet: heroPhotos
            ? {
                key: heroPhotos.key,
                label: heroPhotos.label,
                posterUrl: absUrl(heroPhotos.images[0].src),
              }
            : null,
          heroVideoOptions: [
            ...ROOM_HERO_VIDEOS.map((v) => v.key),
            ...ROOM_HERO_PHOTO_SETS.map((s) => s.key),
          ],
          heroImage: heroImageUrl
            ? {
                theme: room.heroImageTheme,
                label: heroImageThemeInfo?.label ?? room.heroImageTheme,
                imageUrl: absUrl(heroImageUrl),
                // The guest hero prefers a video/photo preset when both are set.
                visibleToGuests: !heroVideo && !heroPhotos,
              }
            : null,
          heroImageOptions: [...HERO_IMAGE_THEMES.map((t) => t.key), "auto"],
        },
        sharedDocuments: liveShares.map((s) => ({
          shareId: s.id,
          label: s.liveLabel ?? s.projectTitle,
          project: s.projectTitle,
          permissions: s.permissions,
          section: s.roomSection,
        })),
        // Hidden from the partner (past their expiry) — surface so the agent
        // can offer to renew instead of reporting them as live.
        expiredDocuments: expiredShares.map((s) => ({
          shareId: s.id,
          label: s.liveLabel ?? s.projectTitle,
          expiredAt: s.expiresAt,
        })),
        roomItems: items.map((i) => ({
          id: i.id,
          kind: i.kind,
          title: i.title,
          url: i.url,
          section: i.category,
        })),
        nextSteps: nextSteps.map((s) => ({
          id: s.id,
          text: s.text,
          assignedTo: s.assignedTo,
          dueAt: s.dueAt,
          completedAt: s.completedAt,
        })),
        guests: detail.members.length,
        setupChecklist: checklist,
        availableDocuments: availableDocs.map((d) => ({
          linkId: d.id,
          label: d.label,
          kind: d.kind,
          project: d.lobTitle,
        })),
      },
    };
  },
};
