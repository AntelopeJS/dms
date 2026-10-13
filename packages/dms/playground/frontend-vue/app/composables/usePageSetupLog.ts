/** One line the demo page setup function wrote. */
export interface PageSetupLogEntry {
  at: Date;
  message: string;
  detail?: string;
}

const MAX_ENTRIES = 20;

// Client-only state: the setup function runs in the browser alone, after the
// page mounted, so nothing of it is ever rendered on the server.
const entries = ref<PageSetupLogEntry[]>([]);

/** Adds a line to the demo log, newest first. */
export function writePageSetupLog(message: string, detail?: string): void {
  entries.value = [{ at: new Date(), message, detail }, ...entries.value].slice(
    0,
    MAX_ENTRIES,
  );
}

/** What the demo page setup function did, newest first. */
export function usePageSetupLog(): Readonly<Ref<PageSetupLogEntry[]>> {
  return entries;
}
