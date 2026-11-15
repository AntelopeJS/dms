import { ref, shallowRef } from "vue";
import { vi } from "vitest";
import type { ApiAnswer } from "./api-data-runtime";

/**
 * Stubs the reads the sidebar's module badge makes: `answers` maps an
 * endpoint to what it returns, and an endpoint without one returns nothing.
 */
export function stubModuleReads(
  answers: ReadonlyMap<string, ApiAnswer> = new Map(),
): void {
  vi.stubGlobal("useApiData", (url: () => string | null) => ({
    data: shallowRef(answers.get(url() ?? "") ?? null),
    error: ref(null),
    pending: ref(false),
    status: ref("success"),
  }));
  vi.stubGlobal("useAuthFetch", () => ({ $authFetch: vi.fn() }));
  vi.stubGlobal("useApiErrorPresenter", () => ({ resolveError: vi.fn() }));
}
