import { ref, type Ref } from "vue";
import { vi } from "vitest";
import type { useDmsState } from "#dms/frontend-module";

/**
 * Stubs `useDmsState` over `state`: the first read of a key keeps what its
 * initializer returns in a ref, and later reads give that ref back.
 */
export function stubDmsState(state: Map<string, Ref<unknown>>): void {
  vi.stubGlobal(
    "useDmsState",
    (key: string, initial: Parameters<typeof useDmsState>[1]) => {
      if (!state.has(key)) state.set(key, ref(initial?.()));
      return state.get(key);
    },
  );
}
