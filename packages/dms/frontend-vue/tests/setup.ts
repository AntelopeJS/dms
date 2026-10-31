import { beforeEach, vi } from "vitest";

beforeEach(() => {
  vi.stubGlobal("useReadOnlyRefusal", () => () => false);
});
