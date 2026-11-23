/**
 * The Mockups icon is in the header for the platform owner alone, and opens
 * the Mockups page.
 *
 * @packageDocumentation
 */
import { computed, ref, type Ref } from "vue";
import { createI18n } from "vue-i18n";
import type { useDmsState } from "#dms/frontend-module";
import { beforeEach, expect, it, vi } from "vitest";
import en from "../layers/dms-layout/app/entries/i18n/locales/layout-en-GB.json";
import fr from "../layers/dms-layout/app/entries/i18n/locales/layout-fr-FR.json";
import { dmsAppContext, emptyApp } from "./fixtures/dmsAppContext";

let actions: Ref<unknown> | undefined;
const isOwner = ref(false);
const push = vi.fn(async () => undefined);

vi.stubGlobal("computed", computed);
vi.stubGlobal(
  "useDmsState",
  (_key: string, init: NonNullable<Parameters<typeof useDmsState>[1]>) =>
    (actions ??= ref(init())),
);
vi.stubGlobal("defineDmsPlugin", <T>(setup: T) => setup);
vi.stubGlobal("useIsOwner", () => computed(() => isOwner.value));
vi.stubGlobal("useDmsRouter", () => ({ push }));

const { registerHeaderAction, useHeaderActions } = await import(
  "../layers/dms-layout/app/composables/useHeaderActions"
);
vi.stubGlobal("registerHeaderAction", registerHeaderAction);

const { default: plugin } = await import(
  "../layers/dms-layout/app/entries/mockups/header-action"
);

const i18n = createI18n({
  legacy: false,
  locale: "fr",
  fallbackLocale: "en",
  messages: { en, fr },
});

beforeEach(async () => {
  actions = undefined;
  isOwner.value = false;
  push.mockClear();
  await plugin(dmsAppContext(emptyApp()));
});

const mockupsAction = () =>
  useHeaderActions().actions.value.find(({ id }) => id === "dms-mockups");

it("shows the icon only while the viewer owns the platform, read when the header draws (fails on an icon for every signed-in user, or on the owner read once at registration)", () => {
  expect(mockupsAction()).toBeUndefined();
  isOwner.value = true;
  expect(mockupsAction()?.order).toBe(90);
  isOwner.value = false;
  expect(mockupsAction()).toBeUndefined();
});

it("opens the Mockups page, labelled in the viewer's language (fails on opening `/mockup`, the viewer of one mockup, which needs a name, or on a label in one language only)", () => {
  isOwner.value = true;
  mockupsAction()?.onSelect?.();
  expect(push).toHaveBeenCalledWith("/mockups");
  expect(i18n.global.t(mockupsAction()?.label.slice(1) ?? "")).toBe(
    "Maquettes",
  );
  expect(
    i18n.global.t(mockupsAction()?.label.slice(1) ?? "", {}, { locale: "en" }),
  ).toBe("Mockups");
});
