import { readonly, ref, type Ref } from "vue";

interface PublishedEvent {
  topic?: unknown;
  payload?: { ids?: unknown; count?: unknown };
}

function rowKeysOf(event: PublishedEvent): string[] {
  const ids = event.payload?.ids;
  if (!Array.isArray(ids)) return [];
  const topic = typeof event.topic === "string" ? event.topic : "";
  return ids
    .filter((id) => typeof id === "string" || typeof id === "number")
    .map((id) => JSON.stringify([topic, id]));
}

function batchCountOf(event: PublishedEvent): number | null {
  const count = event.payload?.count;
  return typeof count === "number" && Number.isInteger(count) && count > 0
    ? count
    : null;
}

/**
 * What the events received since the pause stand for, published rows rather
 * than messages: a message naming rows in `payload.ids` counts each row once
 * (a table view's row events, a bulk write), a batch announcing
 * `payload.count` counts that many (a module publishing its requests every
 * second or so), anything else counts one. The same event object reaching
 * the tally twice (one event, several blocks) counts once.
 *
 * @internal
 */
export class MissedTally {
  private readonly count = ref(0);
  private events = new WeakSet<object>();
  private rows = new Set<string>();
  /** The rows and events counted since the last reset. */
  readonly total: Readonly<Ref<number>> = readonly(this.count);

  add(event: object | undefined): void {
    if (event) {
      if (this.events.has(event)) return;
      this.events.add(event);
    }
    this.count.value += this.weightOf(event as PublishedEvent | undefined);
  }

  reset(): void {
    this.count.value = 0;
    this.events = new WeakSet();
    this.rows = new Set();
  }

  private weightOf(event: PublishedEvent | undefined): number {
    if (!event) return 1;
    const rowKeys = rowKeysOf(event);
    if (rowKeys.length > 0) {
      const fresh = rowKeys.filter((key) => !this.rows.has(key));
      fresh.forEach((key) => this.rows.add(key));
      return fresh.length;
    }
    return batchCountOf(event) ?? 1;
  }
}
