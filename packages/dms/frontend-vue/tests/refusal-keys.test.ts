import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { createI18n } from "vue-i18n";
import { useApiErrorPresenter } from "../layers/dms-core/app/composables/useApiErrorPresenter";
import coreEn from "../layers/dms-core/app/entries/i18n/locales/core-en-GB.json";
import coreFr from "../layers/dms-core/app/entries/i18n/locales/core-fr-FR.json";
import { isString } from "../layers/dms-core/app/utils/type-check";

const HTTP_FORBIDDEN = 403;
const PLACEHOLDER = /\{(\w+)\}/g;

interface Catalog {
  readonly [key: string]: string | Catalog;
}

interface RefusalBody {
  readonly message: string;
  readonly params?: Readonly<Record<string, string>>;
}

function install() {
  vi.stubEnv("SSR", false);
  const i18n = createI18n({
    legacy: false,
    locale: "en-GB",
    fallbackLocale: "en-GB",
    messages: { "en-GB": coreEn, "fr-FR": coreFr },
  });
  const ledger = ref(new WeakMap());
  vi.stubGlobal("useDmsState", () => ledger);
  vi.stubGlobal("getPluginI18n", () => ({ i18n: i18n.global }));
  vi.stubGlobal("useToast", () => ({ add: vi.fn(), update: vi.fn() }));
  vi.stubGlobal("window", {});
  return i18n.global;
}

function refusal(data: string | RefusalBody) {
  return {
    response: new Response(null, { status: HTTP_FORBIDDEN }),
    data,
  };
}

function textOf(error: ReturnType<typeof refusal>): string | undefined {
  return useApiErrorPresenter().resolveError(error, {
    fallbackKey: "error.request_refused.title",
  })?.message;
}

function leaves(node: Catalog, prefix = ""): Array<[string, string]> {
  return Object.entries(node).flatMap(([key, child]) => {
    const path = prefix === "" ? key : `${prefix}.${key}`;
    return isString(child) ? [[path, child]] : leaves(child, path);
  });
}

function placeholdersOf(text: string): string[] {
  return [...text.matchAll(PLACEHOLDER)].map(([, name]) => name ?? "").sort();
}

beforeEach(() => {
  vi.clearAllMocks();
  install();
});

describe("a keyed refusal from a backend route, shown by the error presenter", () => {
  it("renders the text of a string body in the active language", () => {
    const composer = install();
    const answer = refusal("$dms.refusals.export.not_accessible");

    expect(textOf(answer)).toBe("Export not accessible");
    composer.locale.value = "fr-FR";
    expect(textOf(answer)).toBe("Export inaccessible");
  });

  it("fills the placeholders of an object body from its params", () => {
    const composer = install();
    const answer = refusal({
      message: "$dms.refusals.permissions.missing_permission",
      params: { permissionId: "tasks.delete" },
    });

    expect(textOf(answer)).toBe("Forbidden: missing permission tasks.delete");
    composer.locale.value = "fr-FR";
    expect(textOf(answer)).toBe("Interdit : permission tasks.delete manquante");
  });

  it("shows the caller's fallback, never the sentence, for the body a route sent before it sent keys (fails when a route still sends a sentence)", () => {
    expect(textOf(refusal("Export not accessible"))).toBe(
      coreEn.error.request_refused.title,
    );
  });
});

describe("the refusal catalog", () => {
  const english = new Map(leaves(coreEn.dms.refusals));
  const french = new Map(leaves(coreFr.dms.refusals));

  it("holds the same refusals in both languages, each with the same placeholders (fails when a translation is missing, or drops or renames a param)", () => {
    expect(english.size).toBeGreaterThan(0);
    expect([...french.keys()].sort()).toEqual([...english.keys()].sort());
    for (const [key, text] of english) {
      expect(placeholdersOf(french.get(key) ?? ""), key).toEqual(
        placeholdersOf(text),
      );
    }
  });
});
