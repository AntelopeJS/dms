import { ref } from "vue";
import { vi } from "vitest";
import { createI18n } from "vue-i18n";
import { useApiErrorPresenter } from "../../layers/dms-core/app/composables/useApiErrorPresenter";

interface MessageTree {
  readonly [key: string]: string | MessageTree;
}

const catalogs = import.meta.glob<MessageTree>(
  "../../layers/*/i18n/locales/*en-GB.json",
  { eager: true, import: "default" },
);

function isMessage(entry: string | MessageTree): entry is string {
  return typeof entry === "string";
}

function keyMessages(tree: MessageTree, prefix = ""): MessageTree {
  return Object.fromEntries(
    Object.entries(tree).map(([key, entry]) => {
      const path = prefix ? `${prefix}.${key}` : key;
      return [key, isMessage(entry) ? path : keyMessages(entry, path)];
    }),
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
    const state: unknown = Object.getOwnPropertyDescriptor(
      globalThis,
      "useDmsState",
    )?.value;
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
