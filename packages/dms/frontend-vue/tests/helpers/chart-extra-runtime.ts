import { createApp, defineComponent, h, type App, type Component } from "vue";
import { vi } from "vitest";
import { useToast } from "@nuxt/ui/runtime/composables/useToast.js";
import { useOverlay } from "@nuxt/ui/runtime/composables/useOverlay.js";
import { engine } from "./api-data-runtime";
import { stubBlockRuntime } from "./block-runtime";
import { useModal } from "../../layers/dms-ui/app/composables/containers/useModal";
import { useDrawer } from "../../layers/dms-ui/app/composables/containers/useDrawer";
import { useConfirm } from "../../layers/dms-ui/app/composables/confirm/useConfirm";
import { useExportJob } from "../../layers/dms-ui/app/composables/useExportJob";
import { useSiteLayout } from "../../layers/dms-layout/app/composables/page/useSiteLayout";
import Card from "../../layers/dms-ui/app/components/card/Card.vue";

export async function extraRuntime(
  fetch: Parameters<typeof stubBlockRuntime>[0],
) {
  await stubBlockRuntime(fetch);
  for (const [name, value] of Object.entries({
    useToast,
    useOverlay,
    useModal,
    useDrawer,
    useConfirm,
    useExportJob,
    useSiteLayout,
  }))
    vi.stubGlobal(name, value);
}

export function provideExtraRuntime(app: App, server = false) {
  const runtime = engine.createDmsFrontendRuntime(undefined, undefined, server);
  engine.provideDmsFrontendRuntime(app, runtime);
  return runtime;
}

export const TextBoundary = defineComponent({
  props: {
    label: String,
    title: String,
    description: String,
  },
  setup:
    (props, { slots }) =>
    () =>
      h("div", [
        props.label,
        props.title,
        props.description,
        slots.default?.(),
        slots.description?.(),
        slots.leading?.(),
      ]),
});

export function registerTextBoundaries(app: App) {
  app.component("DmsCard", Card);
  app.component("DmsLink", engine.DmsLink);
  app.component(
    "UButton",
    defineComponent({
      props: { label: String },
      setup:
        (props, { slots }) =>
        () =>
          h("button", [props.label, slots.default?.()]),
    }),
  );
  for (const name of ["UAlert", "UBadge", "UIcon", "USkeleton"])
    app.component(name, TextBoundary);
}

export function mountExtra(
  component: Component,
  props: Parameters<typeof createApp>[1],
) {
  const root = document.createElement("div");
  const app = createApp(component, props);
  provideExtraRuntime(app);
  registerTextBoundaries(app);
  app.mount(root);
  return { app, root };
}

export const plainSpaces = (text: string) =>
  text.replace(/[\u00a0\u202f]/g, " ");

export function installApexDom() {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  Object.defineProperty(SVGElement.prototype, "getBBox", {
    configurable: true,
    value() {
      return { x: 0, y: 0, width: 50, height: 20 };
    },
  });
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
    () => new DOMRect(0, 0, 600, 300),
  );
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(600);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(300);
}
