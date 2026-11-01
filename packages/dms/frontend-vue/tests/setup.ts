import { beforeEach, vi } from "vitest";
import { installApiErrorRuntime } from "./helpers/api-error-runtime";

beforeEach(() => {
  vi.stubGlobal("useToast", () => ({
    add: vi.fn(() => ({ id: crypto.randomUUID() })),
    update: vi.fn(),
    remove: vi.fn(),
  }));
  installApiErrorRuntime();
});
