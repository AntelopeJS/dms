import { GrantsEveryPermission } from "@antelopejs/interface-dms/permissions";
import { describe, expect, it, vi } from "vitest";
import { ref } from "vue";

const loaded = ref<{ ids: string[]; loadedAt: number } | null>(null);
vi.stubGlobal("useDmsData", () => ({ data: loaded }));

const { usePermissions } = await import(
  "../layers/dms-core/app/composables/auth/usePermissions"
);

const SETS = [
  [],
  ["orders.read"],
  ["*"],
  ["*", "orders.read"],
  ["orders"],
  ["**"],
  ["*.read"],
];
const IDS = ["orders.read", "orders", "*", "billing"];

describe("the browser's hasPermission", () => {
  it.each(SETS.map((ids) => ({ ids })))(
    "answers for $ids what GrantsEveryPermission, or a direct grant, answers on the server (catches a browser copy of the wildcard that drifts)",
    ({ ids }) => {
      loaded.value = { ids, loadedAt: Date.now() };
      const set = new Set(ids);
      const { hasPermission } = usePermissions();
      for (const id of IDS) {
        expect(hasPermission(id), id).toBe(
          GrantsEveryPermission(set) || set.has(id),
        );
      }
    },
  );
});
