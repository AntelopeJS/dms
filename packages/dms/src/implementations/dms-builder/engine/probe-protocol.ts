import { z } from "zod";

/** The one variable of the child's environment: the request, which it deletes once read. */
export const PROBE_REQUEST = "DMS_PROBE_REQUEST";

/** What starts the line of the child's stdout that holds its outcome, among anything a driver prints. */
export const OUTCOME_MARK = "dms-probe-outcome ";

/** What the check sends the child: where to require the driver's `probe` from, and what to check. */
export const ProbeRequest = z.object({
  specifier: z.string(),
  bases: z.array(z.string()),
  url: z.string(),
  timeoutMs: z.number(),
});

/** Where the child requires the driver's `probe` from, and what it checks. */
export type ProbeRequest = z.infer<typeof ProbeRequest>;

/** What the child answers: the driver's answer, a driver not installed, or a failure. */
export const ProbeOutcomeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("answer"), answer: z.unknown() }),
  z.object({ kind: z.literal("missing") }),
  z.object({ kind: z.literal("failed"), message: z.string() }),
]);

/** What the driver's `probe` came to in its own process. */
export type ProbeOutcome = z.infer<typeof ProbeOutcomeSchema>;
