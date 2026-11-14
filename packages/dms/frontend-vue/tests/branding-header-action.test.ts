/**
 * The Branding icon is in the header for the platform owner alone, and opens
 * the editor's page.
 */
import { computed, createApp, ref, type Ref } from "vue";
import { createI18n } from "vue-i18n";
import { beforeEach, expect, it, vi } from "vitest";
import fr from "../layers/dms-layout/app/entries/i18n/locales/layout-fr-FR.json";
import { dmsAppContext } from "./fixtures/dmsAppContext";

let actions: Ref<unknown> | undefined;
const isOwner = ref(false);
const push = vi.fn(async () => undefined);

vi.stubGlobal("computed", computed);
vi.stubGlobal(
  "useDmsState",
  (_key: string, init: () => unknown) => (actions ??= ref(init())),
);
vi.stubGlobal("defineDmsPlugin", <T>(setup: T) => setup);
vi.stubGlobal("useIsOwner", () => computed(() => isOwner.value));
vi.stubGlobal("useDmsRouter", () => ({ push }));

const { registerHeaderAction, useHeaderActions } = await import(
  "../layers/dms-layout/app/composables/useHeaderActions"
);
vi.stubGlobal("registerHeaderAction", registerHeaderAction);

const { default: plugin } = await import(
  "../layers/dms-layout/app/entries/branding/header-action"
);

const i18n = createI18n({ legacy: false, locale: "fr", messages: { fr } });

beforeEach(() => {
  actions = undefined;
  isOwner.value = false;
  plugin(dmsAppContext(createApp({ render: () => null })));
});

const brandingAction = () =>
  useHeaderActions().actions.value.find(({ id }) => id === "dms-branding");

it("shows the icon only while the viewer owns the platform", () => {
  expect(brandingAction()).toBeUndefined();
  isOwner.value = true;
  expect(brandingAction()?.order).toBe(91);
});

it("opens the Branding page, labelled in the viewer's language", () => {
  isOwner.value = true;
  brandingAction()?.onSelect?.();
  expect(push).toHaveBeenCalledWith("/branding");
  expect(i18n.global.t(brandingAction()?.label.slice(1) ?? "")).toBe(
    "Image de marque",
  );
});
