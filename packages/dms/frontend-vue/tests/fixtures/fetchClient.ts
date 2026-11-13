import { vi } from "vitest";
import type { $fetch } from "#dms/frontend-module";

/**
 * A fetch client whose callable records each call and answers it with
 * `respond`'s result; `raw`, `native` and `create` record their calls and
 * answer `undefined`.
 */
export function fetchClient<Args extends unknown[], Answer>(
  respond: (url: string, ...rest: Args) => Answer,
) {
  const client = Object.assign(vi.fn(respond), {
    raw: vi.fn(),
    native: vi.fn(),
    create: vi.fn(),
  });
  // SAFETY: Holds when the code under test calls the client only as client<T>(url, options) with options of the shape respond declares, reads from each answer only what respond returns, and never reads raw, native or create.
  return client as typeof client & typeof $fetch;
}
