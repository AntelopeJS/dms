import { z } from "zod";

/**
 * What the `dms-control browser` client and the browser server post to each
 * other, decoded on both sides.
 */

const name = z.string().optional();
const exact = z.boolean().optional();

/** One browser action, as the client posts it. */
export const browserRequestSchema =
  /** @satisfies {z.ZodType<import("./browser.mjs").BrowserRequest>} */ (
    z.object({
      do: z.string(),
      account: z.string(),
      tab: z.string(),
      folder: z.string(),
      target: z
        .object({
          role: z.string(),
          name,
          exact,
          nth: z.number().optional(),
          within: z.object({ role: z.string(), name, exact }).optional(),
        })
        .optional(),
      value: z.string().optional(),
      key: z.string().optional(),
      path: z.string().optional(),
      state: z.enum(["attached", "detached", "visible", "hidden"]).optional(),
      timeoutMs: z.number().optional(),
    })
  );

/** What the server answers for one action. */
export const outcomeSchema =
  /** @satisfies {z.ZodType<import("./browser.mjs").Outcome>} */ (
    z.object({
      ok: z.boolean(),
      url: z.string(),
      error: z.string().nullable(),
      aria: z.string(),
    })
  );
