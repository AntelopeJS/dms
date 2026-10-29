import { vi } from "vitest";

/** A fetch client that records calls and answers none; for code that must not fetch. */
export function unusedApi(): ReturnType<typeof $fetch.create> {
  return Object.assign(vi.fn(), {
    raw: vi.fn(),
    native: vi.fn(),
    create: vi.fn(),
  });
}
