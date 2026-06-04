"use client";

/**
 * A minimal Yjs network provider that uses a Supabase Realtime broadcast
 * channel as the transport — no websocket server to run (Vercel can't host one).
 *
 * How it works:
 *  - Local Yjs updates are broadcast to everyone on the doc's channel.
 *  - Incoming updates are applied with `origin = this`, so the doc's own
 *    `update` event won't echo them back out (no broadcast storms).
 *  - On join we send a `sync-request`; every peer replies with its full state
 *    (a normal update merges cleanly thanks to the CRDT), so a late joiner
 *    converges. The DB snapshot seeds the doc before the provider connects, so
 *    even a solo first-opener starts from saved content.
 *  - Awareness (cursors / who's-here) rides the same channel.
 *
 * BlockNote only needs `provider.awareness`; it drives the shared content from
 * the Y.XmlFragment directly.
 */
import { createClient } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";
import * as Y from "yjs";
import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
  removeAwarenessStates,
} from "y-protocols/awareness";
import { toBase64, fromBase64 } from "./yjs-base64";

export type AwarenessUser = { name: string; color: string };

export class SupabaseYjsProvider {
  readonly doc: Y.Doc;
  readonly awareness: Awareness;
  private channel: RealtimeChannel;
  private synced = false;

  constructor(channelName: string, doc: Y.Doc, user: AwarenessUser) {
    this.doc = doc;
    this.awareness = new Awareness(doc);
    this.awareness.setLocalStateField("user", user);

    const supabase = createClient();
    this.channel = supabase.channel(channelName, {
      config: { broadcast: { self: false } },
    });

    this.doc.on("update", this.onDocUpdate);
    this.awareness.on("update", this.onAwarenessUpdate);

    this.channel
      .on("broadcast", { event: "update" }, ({ payload }) => {
        Y.applyUpdate(this.doc, fromBase64(payload.update as string), this);
      })
      .on("broadcast", { event: "awareness" }, ({ payload }) => {
        applyAwarenessUpdate(
          this.awareness,
          fromBase64(payload.update as string),
          this,
        );
      })
      .on("broadcast", { event: "sync-request" }, () => this.sendState())
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          // Ask peers for their state, and announce our own state + cursor.
          this.channel.send({ type: "broadcast", event: "sync-request", payload: {} });
          this.sendState();
          this.broadcastAwareness(Array.from(this.awareness.getStates().keys()));
          this.synced = true;
        }
      });
  }

  get isSynced(): boolean {
    return this.synced;
  }

  private onDocUpdate = (update: Uint8Array, origin: unknown) => {
    if (origin === this) return; // came from the network — don't echo
    this.channel.send({
      type: "broadcast",
      event: "update",
      payload: { update: toBase64(update) },
    });
  };

  private onAwarenessUpdate = (changes: {
    added: number[];
    updated: number[];
    removed: number[];
  }) => {
    this.broadcastAwareness([...changes.added, ...changes.updated, ...changes.removed]);
  };

  private broadcastAwareness(clients: number[]) {
    if (clients.length === 0) return;
    this.channel.send({
      type: "broadcast",
      event: "awareness",
      payload: { update: toBase64(encodeAwarenessUpdate(this.awareness, clients)) },
    });
  }

  /** Broadcast our full document state so peers converge. */
  private sendState() {
    this.channel.send({
      type: "broadcast",
      event: "update",
      payload: { update: toBase64(Y.encodeStateAsUpdate(this.doc)) },
    });
  }

  destroy() {
    this.doc.off("update", this.onDocUpdate);
    this.awareness.off("update", this.onAwarenessUpdate);
    removeAwarenessStates(this.awareness, [this.doc.clientID], "provider destroyed");
    this.awareness.destroy();
    this.channel.unsubscribe();
  }
}
