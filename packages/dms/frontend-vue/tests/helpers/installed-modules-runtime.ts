import { ref } from "vue";
import { vi } from "vitest";

/**
 * Stubs the reads the sidebar's module badge makes: `answers` maps an
 * endpoint to what it returns, and an endpoint without one returns nothing.
 */
export function stubModuleReads(answers: Record<string, unknown> = {}): void {
  vi.stubGlobal("useApiData", (url: () => string | null) => ({
    data: ref(answers[url() ?? ""] ?? null),
    error: ref(null),
    pending: ref(false),
  }));
  vi.stubGlobal("useAuthFetch", () => ({ $authFetch: vi.fn() }));
  vi.stubGlobal("useApiErrorPresenter", () => ({ resolveError: vi.fn() }));
}
