import { computed, shallowRef, type ComputedRef } from "vue";
import type { PageLiveNote, PageLiveNoteInput } from "../../../types/live";

interface HoldEntry {
  note: PageLiveNote;
  /** The user resumed over this hold: it no longer pauses the page. */
  isLifted: boolean;
}

/**
 * A note given as its text alone, as a full note.
 *
 * @internal
 */
export function toLiveNote(input: PageLiveNoteInput): PageLiveNote {
  return typeof input === "string" ? { text: input } : input;
}

/**
 * The components holding a live page paused, each with its reason. A hold the
 * user resumed over is lifted: it stays lifted while its owner keeps holding,
 * and pauses again once released and taken anew.
 *
 * @internal
 */
export class LiveHolds {
  private readonly entries = shallowRef(new Map<symbol, HoldEntry>());

  /** The reason of the first hold still pausing the page, `null` without one. */
  readonly activeNote: ComputedRef<PageLiveNote | null> = computed(() => {
    for (const entry of this.entries.value.values()) {
      if (!entry.isLifted) return entry.note;
    }
    return null;
  });

  get isActive(): boolean {
    return this.activeNote.value !== null;
  }

  set(owner: symbol, note: PageLiveNoteInput): void {
    const isLifted = this.entries.value.get(owner)?.isLifted ?? false;
    this.replace((entries) =>
      entries.set(owner, { note: toLiveNote(note), isLifted }),
    );
  }

  release(owner: symbol): void {
    if (!this.entries.value.has(owner)) return;
    this.replace((entries) => entries.delete(owner));
  }

  liftAll(): void {
    this.replace((entries) => {
      for (const entry of entries.values()) entry.isLifted = true;
    });
  }

  private replace(change: (entries: Map<symbol, HoldEntry>) => void): void {
    const next = new Map(
      [...this.entries.value].map(([owner, entry]) => [owner, { ...entry }]),
    );
    change(next);
    this.entries.value = next;
  }
}
