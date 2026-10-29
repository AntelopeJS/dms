import { vi } from "vitest";

/** A mocked fetch client: the callable and its `raw`, `native` and `create` members. */
export function fetchClientMock() {
  return Object.assign(vi.fn(), {
    raw: vi.fn(),
    native: vi.fn(),
    create: vi.fn(),
  });
}

/** A fetch client that records calls and answers none; for code that must not fetch. */
export const unusedApi = fetchClientMock;
