/** @vitest-environment jsdom */
/**
 * `useOpenDialog` follows the dialogs the closing-layers watch tracks: a
 * drawer, a modal or a slideover open on the page, whoever rendered it, and
 * not a popover, whose content is a dialog layer anchored to its trigger.
 */
import { createApp, h, nextTick, type App, type Ref } from "vue";
import { afterEach, expect, it } from "vitest";
import { useOpenDialog } from "../layers/dms-ui/app/build/composables/containers/closingLayers";

let app: App | undefined;

afterEach(() => {
  app?.unmount();
  app = undefined;
  document.body.replaceChildren();
});

function mountWatcher(): Ref<boolean> {
  let isOpen!: Ref<boolean>;
  app = createApp({
    setup() {
      isOpen = useOpenDialog();
      return () => h("div");
    },
  });
  app.mount(document.body.appendChild(document.createElement("div")));
  return isOpen;
}

function dialogLayer(state: "open" | "closed"): HTMLElement {
  const layer = document.createElement("div");
  layer.setAttribute("role", "dialog");
  layer.setAttribute("data-dismissable-layer", "");
  layer.dataset.state = state;
  return layer;
}

const flush = async () => {
  await Promise.resolve();
  await nextTick();
};

it("is on while a drawer or a modal is open, from its mount to its close", async () => {
  const isOpen = mountWatcher();
  expect(isOpen.value).toBe(false);

  const drawer = dialogLayer("open");
  document.body.append(drawer);
  await flush();
  expect(isOpen.value).toBe(true);

  drawer.dataset.state = "closed";
  await flush();
  expect(isOpen.value).toBe(false);

  drawer.dataset.state = "open";
  await flush();
  expect(isOpen.value).toBe(true);

  drawer.remove();
  await flush();
  expect(isOpen.value).toBe(false);
});

it("reads a dialog already open when it mounts", () => {
  document.body.append(dialogLayer("open"));
  expect(mountWatcher().value).toBe(true);
});

it("stays off while only a popover is open", async () => {
  const isOpen = mountWatcher();
  const wrapper = document.createElement("div");
  wrapper.setAttribute("data-reka-popper-content-wrapper", "");
  wrapper.append(dialogLayer("open"));
  document.body.append(wrapper);
  await flush();
  expect(isOpen.value).toBe(false);
});
