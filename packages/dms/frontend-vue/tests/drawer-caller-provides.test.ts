/** @vitest-environment jsdom */
/**
 * A module drawer opened through `useDrawer` and Nuxt UI's overlay injects
 * what its caller provides as the caller would: the overlay keeps its props
 * reactive, and that must not wrap what the body injects.
 */
import {
  computed,
  createApp,
  defineComponent,
  h,
  markRaw,
  nextTick,
  provide,
  reactive,
  ref,
  watch,
  type App,
  type Component,
} from "vue";
import { DialogRoot } from "reka-ui";
import { createI18n, useI18n } from "vue-i18n";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

let app: App | undefined;
let host: HTMLDivElement;

const PassThrough = defineComponent({
  setup:
    (_props, { slots }) =>
    () =>
      h("div", slots.default?.()),
});

const DrawerStub = defineComponent({
  setup:
    (_props, { slots }) =>
    () =>
      h(DialogRoot, null, () => [slots.header?.(), slots.body?.()]),
});

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  vi.stubGlobal("ref", ref);
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("watch", watch);
  vi.stubGlobal("provide", provide);
  vi.stubGlobal("markRaw", markRaw);
  vi.stubGlobal("useDmsCookie", () => ref(null));
  vi.stubGlobal("useLeaveGuard", () => ({
    executeGuards: async () => true,
    clearGuards: vi.fn(),
  }));
  vi.stubGlobal("useDmsRoute", () => reactive({ path: "/" }));
  vi.stubGlobal("useI18n", () => ({ t: (key: string) => key }));
});

afterEach(() => {
  app?.unmount();
  app = undefined;
  host.remove();
  vi.unstubAllGlobals();
});

it("gives a module drawer's body the refs useI18n returns", async () => {
  const { useOverlay } = await import(
    "@nuxt/ui/runtime/composables/useOverlay.js"
  );
  vi.stubGlobal("useOverlay", useOverlay);
  const { default: OverlayProvider } = await import(
    "@nuxt/ui/runtime/components/OverlayProvider.vue"
  );
  const { useDrawer } = await import(
    "../layers/dms-ui/app/composables/containers/useDrawer"
  );
  const read: { locale?: unknown } = {};
  const Body: Component = {
    setup() {
      read.locale = useI18n().locale.value;
      return () => null;
    },
  };
  const Caller: Component = {
    setup() {
      useDrawer().open({ title: "Details", component: Body });
      return () => null;
    },
  };
  app = createApp({ setup: () => () => [h(Caller), h(OverlayProvider)] });
  app.use(createI18n({ legacy: false, locale: "fr", messages: { fr: {} } }));
  app.component("UDrawer", DrawerStub);
  app.component("UContainer", PassThrough);
  app.component("UButton", () => h("button"));
  app.component("USkeleton", () => h("span"));
  app.mount(host);
  await nextTick();
  await nextTick();

  expect(read.locale).toBe("fr");
});
