/**
 * The table footer counts its rows in the locale's grammar: one row is
 * "1 élément", several are "2 éléments".
 *
 * @packageDocumentation
 * @vitest-environment jsdom
 */
import {
  computed,
  createApp,
  defineComponent,
  h,
  provide,
  ref,
  shallowRef,
  type App,
} from "vue";
import { createI18n, useI18n } from "vue-i18n";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import TablePagination from "../layers/dms-ui/app/entries/components/table/TablePagination";
import en from "../layers/dms-ui/app/entries/i18n/locales/ui-en-GB.json";
import fr from "../layers/dms-ui/app/entries/i18n/locales/ui-fr-FR.json";

let app: App | undefined;

function countText(locale: "en" | "fr", rowCount: number): string {
  const Host = defineComponent({
    setup() {
      provide(
        "tableSharedData",
        shallowRef({
          rowCount,
          firstPageLoading: false,
          paginationState: ref({ pageIndex: 0, pageSize: 25 }),
          chrome: computed(() => ({ pageSize: false })),
          table: {
            getCanPreviousPage: () => false,
            getCanNextPage: () => false,
          },
        }),
      );
      return () => h(TablePagination);
    },
  });
  app = createApp(Host);
  app.use(createI18n({ legacy: false, locale, messages: { en, fr } }));
  for (const name of ["UButton", "USkeleton", "USelect", "UIcon"]) {
    app.component(name, defineComponent({ render: () => null }));
  }
  const container = document.createElement("div");
  app.mount(container);
  return container.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

beforeEach(() => {
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("useI18n", useI18n);
  vi.stubGlobal("useTranslation", () => ({
    processI18n: (text: string) => text,
  }));
  vi.stubGlobal("useDmsAppConfig", () => ({ ui: { icons: {} } }));
});

afterEach(() => {
  app?.unmount();
  app = undefined;
  vi.unstubAllGlobals();
});

it("counts one row in the singular and several in the plural", () => {
  expect(countText("fr", 1)).toBe("1 élément");
  expect(countText("fr", 2)).toBe("2 éléments");
  expect(countText("en", 1)).toBe("1 item");
  expect(countText("en", 3)).toBe("3 items");
});
