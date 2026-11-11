import { z } from "zod";
import { queryLogs } from "../log-buffer";
import { defineTool, textResult } from "../tool";

/** query_logs: the host's recent log entries, from the buffer the server fills. */
export const queryLogsTool = defineTool({
  name: "query_logs",
  title: "Query logs",
  description:
    "Queries the host's recent log entries (all modules/levels) so you can see the host's ACTUAL hot-reload / build outcome and runtime errors — things a local type check can't catch. Optional filters: `sinceMs` (epoch ms), `level` (numeric: 40=error, 30=warn), `channel`, `limit`. Returns the matching entries newest-first as JSON.",
  effect: "read",
  input: z.object({
    sinceMs: z.number().optional(),
    level: z.number().optional(),
    channel: z.string().optional(),
    limit: z.number().optional(),
  }),
  async run(query) {
    const entries = queryLogs(query);
    return textResult(
      entries.length === 0
        ? "No matching log entries (the backend may still be starting, or nothing matched the filter)."
        : JSON.stringify(entries),
    );
  },
});
