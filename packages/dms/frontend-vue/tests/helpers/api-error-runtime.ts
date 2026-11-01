import { ref } from "vue";
import { vi } from "vitest";
import { createI18n } from "vue-i18n";
import { useApiErrorPresenter } from "../../layers/dms-core/app/composables/useApiErrorPresenter";

const catalogs = import.meta.glob("../../layers/*/i18n/locales/*en-GB.json", {
  eager: true,
  import: "default",
});

function keyMessages(value: unknown, prefix = ""): unknown {
  if (typeof value === "string") return prefix;
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      keyMessages(entry, prefix ? `${prefix}.${key}` : key),
    ]),
  );
}

export function installApiErrorRuntime() {
  const composer = createI18n({
    legacy: false,
    locale: "en",
    messages: { en: {} },
  }).global;
  for (const catalog of Object.values(catalogs))
    composer.mergeLocaleMessage("en", keyMessages(catalog));
  const ledger = ref(new WeakMap());
  vi.stubGlobal("getPluginI18n", () => ({ i18n: composer }));
  vi.stubGlobal("useApiErrorPresenter", () => {
    const state = globalThis.useDmsState;
    vi.stubGlobal("useDmsState", () => ledger);
    try {
      return useApiErrorPresenter();
    } finally {
      vi.stubGlobal("useDmsState", state);
    }
  });
  return composer;
}

export function requestRefusal() {
  return {
    response: new Response(null, { status: 403 }),
    statusCode: 403,
    data: { message: "error.read_only_demo", severity: "warning" },
  };
}
