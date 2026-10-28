<script setup lang="ts">
import DrawerModalDemoContent from "./DrawerModalDemoContent.vue";
import ShowcaseDemo from "./showcase/ShowcaseDemo.vue";
import ShowcaseSection from "./showcase/ShowcaseSection.vue";

/**
 * Layout › Drawer & Modal: the public `useDrawer()` / `useModal()`
 * composables, each option a module picks (the drawer's edge, the modal's
 * size, the header icon), and the handle `open` returns (`result`, `close`,
 * `patch`).
 */

type Direction = "top" | "right" | "bottom" | "left";
type ModalWidth =
  | "sm"
  | "md"
  | "lg"
  | "xl"
  | "2xl"
  | "3xl"
  | "4xl"
  | "5xl"
  | "full";

const DIRECTIONS: Direction[] = ["top", "right", "bottom", "left"];
const DIRECTION_ITEMS = DIRECTIONS.map((value) => ({ label: value, value }));
const MODAL_SIZES: ModalWidth[] = [
  "sm",
  "md",
  "lg",
  "xl",
  "2xl",
  "3xl",
  "4xl",
  "5xl",
  "full",
];
const AUTO_CLOSE_SECONDS = 3;
const SECOND_MS = 1000;

const DRAWER_CODE = `const { open } = useDrawer();
const { result } = open({ title, component, componentOptions, direction: "left" });
const value = await result; // what the body emitted on success, or undefined`;
const MODAL_CODE = `const { open } = useModal();
open({ title, component, size: "3xl", icon: "i-ph-browser", color: "info" });`;
const HANDLE_CODE = `const instance = open({ ... });
instance.patch({ title: "Closing in 2 s" });
instance.close({ auto: true }); // settles result with this value`;

const { open: openDrawer } = useDrawer();
const { open: openModal } = useModal();

const direction = ref<Direction>("right");
const size = ref<ModalWidth>("md");
const lastResult = ref("");

function describe(
  kind: string,
  value: Awaited<ReturnType<typeof openModal>["result"]>,
): void {
  lastResult.value = value
    ? `${kind} confirmed → ${JSON.stringify(value)}`
    : `${kind} dismissed without a result`;
}

function bodyOptions(message: string) {
  return { component: DrawerModalDemoContent, componentOptions: { message } };
}

async function showDrawer(): Promise<void> {
  const { result } = openDrawer({
    title: `Drawer from the ${direction.value}`,
    description: "Opened from a consumer module via useDrawer()",
    direction: direction.value,
    ...bodyOptions(
      "The DMS-themed drawer, opened through the public useDrawer() composable. Confirm to send the note back to the caller.",
    ),
  });
  describe("Drawer", await result);
}

async function showModal(): Promise<void> {
  const { result } = openModal({
    title: `Modal, size ${size.value}`,
    description: "Opened from a consumer module via useModal()",
    size: size.value,
    icon: "i-ph-browser",
    color: "info",
    ...bodyOptions(
      "The DMS-themed modal, opened through the public useModal() composable.",
    ),
  });
  describe("Modal", await result);
}

async function showSelfClosingModal(): Promise<void> {
  const instance = openModal({
    title: `Closing in ${AUTO_CLOSE_SECONDS} s`,
    ...bodyOptions(
      "This modal counts down with patch(), then closes with close().",
    ),
  });
  let remaining = AUTO_CLOSE_SECONDS;
  const timer = setInterval(() => {
    remaining -= 1;
    if (remaining > 0) {
      instance.patch({ title: `Closing in ${remaining} s` });
      return;
    }
    clearInterval(timer);
    instance.close({ auto: true });
  }, SECOND_MS);
  describe("Modal", await instance.result);
  clearInterval(timer);
}
</script>

<template>
  <div class="grid gap-16 pb-10">
    <ShowcaseSection
      id="drawer"
      title="useDrawer()"
      description="Opens a DMS-themed drawer from any edge. The body component emits success with a value, which settles the result promise; dismissing it settles it with undefined."
    >
      <ShowcaseDemo label="direction · result" :code="DRAWER_CODE">
        <div class="flex flex-wrap items-center gap-3">
          <DmsSegmented
            v-model="direction"
            :items="DIRECTION_ITEMS"
            aria-label="Drawer edge"
            size="sm"
          />
          <UButton
            icon="i-ph-sidebar-simple"
            label="Open drawer"
            size="sm"
            @click="showDrawer"
          />
        </div>
      </ShowcaseDemo>
    </ShowcaseSection>

    <ShowcaseSection
      id="modal"
      title="useModal()"
      description="Opens a DMS-themed modal of the chosen width, with an optional tinted icon before the title. 'full' is near full-screen, for long imports and multi-step flows."
    >
      <ShowcaseDemo label="size · icon · color" :code="MODAL_CODE">
        <div class="flex flex-wrap items-center gap-3">
          <USelect
            v-model="size"
            :items="MODAL_SIZES"
            aria-label="Modal size"
            size="sm"
            class="w-28"
          />
          <UButton
            icon="i-ph-browser"
            label="Open modal"
            color="neutral"
            variant="subtle"
            size="sm"
            @click="showModal"
          />
        </div>
      </ShowcaseDemo>
      <ShowcaseDemo
        label="instance.patch() · instance.close(value)"
        :code="HANDLE_CODE"
      >
        <UButton
          icon="i-ph-timer"
          label="Open a modal that closes itself"
          color="neutral"
          variant="outline"
          size="sm"
          class="justify-self-start"
          @click="showSelfClosingModal"
        />
      </ShowcaseDemo>
    </ShowcaseSection>

    <UAlert
      v-if="lastResult"
      color="primary"
      variant="subtle"
      icon="i-ph-check-circle"
      :title="lastResult"
    />
  </div>
</template>
