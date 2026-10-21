<script setup lang="ts">
import { getCurrentInstance, type Component } from "vue";
import { DialogDescription, DialogTitle, VisuallyHidden } from "reka-ui";
import { useWindowSize } from "@vueuse/core";
import type {
  ContainerColor,
  DrawerDirection,
} from "../../../../composables/containers/types";
import type { ModalSize } from "../../../../types/modal";
import {
  drawerSizeStorage,
  isSideDrawer,
  resolveDrawerSizeBounds,
  useDrawerSizePreferences,
} from "../../../composables/containers/drawerSize";
import {
  type ResizeSide,
  useResizableSize,
} from "../../../composables/containers/useResizableSize";
import DmsIconWell from "../../../../components/icon-well/IconWell.vue";
import {
  CLOSING_OVERLAY_CLASS,
  CONTAINER_SKELETON_CLASS,
  CONTAINER_SKELETON_FIELDS,
} from "../constants";
import { DMS_CONTAINER_KEY } from "../../../composables/containers/context";

interface DynamicDrawerProps {
  title: string;
  description?: string;
  containerId: string;
  component: Component;
  componentOptions?: Record<string, unknown>;
  /** Mounts the body component anew when it changes. */
  componentKey?: string;
  headerComponent?: Component;
  headerComponentOptions?: Record<string, unknown>;
  direction?: DrawerDirection;
  /**
   * Width a side drawer opens at, from `lg`: a modal's width at that size;
   * 600px without one. Below `lg`, only `full` fills a phone's screen.
   */
  size?: ModalSize;
  /** The key the size the user gives the drawer is remembered under. */
  sizeKey?: string;
  icon?: string;
  color?: ContainerColor;
  /**
   * What the component that opened the drawer provides (`useDrawer` passes
   * it): the drawer and its body inject it as if rendered in its tree.
   */
  callerProvides?: object;
}

interface DynamicDrawerEmits {
  (e: "close", result?: unknown): void;
}

const props = withDefaults(defineProps<DynamicDrawerProps>(), {
  description: undefined,
  componentOptions: undefined,
  headerComponent: undefined,
  headerComponentOptions: undefined,
  direction: "bottom",
  size: undefined,
  sizeKey: undefined,
  icon: undefined,
  color: "primary",
  callerProvides: undefined,
});
const emit = defineEmits<DynamicDrawerEmits>();

// Mounted by the overlay provider, the drawer would only see the app's
// provides: its own start from the caller's instead, before it provides
// anything (Vue's `provide` then writes into them). What the drawer provides
// itself (its container, the form surface) still wins over the caller's.
const drawerInstance = getCurrentInstance() as { provides: object } | null;
if (drawerInstance && props.callerProvides) {
  drawerInstance.provides = Object.create(props.callerProvides);
}

// Below `lg` a side drawer is a sheet as wide as a side panel (see
// `useAppSidePanels`), or a modal's width at its size, never wider than the
// window less the drawer's gutter (Nuxt UI's `max-w-[calc(100%-2rem)]`): on
// a phone every side drawer leaves the same strip of backdrop, sized or not,
// and only `full` fills the screen. From
// `lg` it takes the width the user resizes it to (600px at first), kept per
// drawer. Its own padding is the gutter: the containers drop theirs.
const SIDE_DRAWER_CONTENT = "w-[440px]";
const SIDE_DRAWER_SIZE_CONTENT: Record<ModalSize, string> = {
  sm: "w-sm",
  md: "w-md",
  lg: "w-lg",
  xl: "w-xl",
  "2xl": "w-2xl",
  "3xl": "w-3xl",
  "4xl": "w-4xl",
  "5xl": "w-5xl",
  full: "w-full max-w-full rounded-none",
};
const SIZE_VARIABLE = "--dms-drawer-size";
const SIDE_DRAWER_DESKTOP_CONTENT = "lg:w-(--dms-drawer-size)";
const EDGE_DRAWER_DESKTOP_CONTENT = "lg:h-(--dms-drawer-size)";
const SIDE_CONTAINER_CLASS = "px-0 sm:px-0 lg:px-0";
const EDGE_CONTAINER_CLASS = "max-sm:px-0";

// The handle sits on the drawer's inner edge, over its border.
const HANDLE_CLASSES: Record<ResizeSide, string> = {
  right: "inset-y-0 left-0 w-2 -translate-x-1/2 cursor-ew-resize",
  left: "inset-y-0 right-0 w-2 translate-x-1/2 cursor-ew-resize",
  bottom: "inset-x-0 top-0 h-2 -translate-y-1/2 cursor-ns-resize",
  top: "inset-x-0 bottom-0 h-2 translate-y-1/2 cursor-ns-resize",
};
const SIDE_HANDLE_LINE = "inset-y-0 start-1/2 w-0.5 -translate-x-1/2";
const EDGE_HANDLE_LINE = "inset-x-0 top-1/2 h-0.5 -translate-y-1/2";

const isSide = computed(() => isSideDrawer(props.direction));
const containerClass = computed(() =>
  isSide.value ? SIDE_CONTAINER_CLASS : EDGE_CONTAINER_CLASS,
);

const viewport = useWindowSize();
const {
  size: resizedSize,
  bounds: sizeBounds,
  isDragging,
  startDrag,
  drag,
  endDrag,
  resizeFromKey,
  reset: resetSize,
} = useResizableSize({
  side: props.direction,
  bounds: () =>
    resolveDrawerSizeBounds(
      props.direction,
      { width: viewport.width.value, height: viewport.height.value },
      props.size,
    ),
  storage: drawerSizeStorage(
    useDrawerSizePreferences(),
    props.sizeKey,
    props.direction,
  ),
});

const sideContentClass = computed(() => {
  const narrow = props.size
    ? SIDE_DRAWER_SIZE_CONTENT[props.size]
    : SIDE_DRAWER_CONTENT;
  return `${narrow} ${SIDE_DRAWER_DESKTOP_CONTENT}`;
});
// A top or bottom drawer keeps its natural height until resized.
const contentClass = computed(() => {
  if (isSide.value) return sideContentClass.value;
  return resizedSize.value === undefined
    ? undefined
    : EDGE_DRAWER_DESKTOP_CONTENT;
});
const contentProps = computed(() =>
  resizedSize.value === undefined
    ? undefined
    : { style: { [SIZE_VARIABLE]: `${resizedSize.value}px` } },
);
const handleClass = computed(() => HANDLE_CLASSES[props.direction]);
const handleLineClass = computed(() =>
  isSide.value ? SIDE_HANDLE_LINE : EDGE_HANDLE_LINE,
);
const handleOrientation = computed(() =>
  isSide.value ? "vertical" : "horizontal",
);

function renderedSize(handle: Element): number | undefined {
  const content = handle.closest("[data-slot='content']");
  if (!content) return undefined;
  const rect = content.getBoundingClientRect();
  return isSide.value ? rect.width : rect.height;
}

// The drawer's own drag (to dismiss it) must not start from the handle.
function startHandleDrag(event: PointerEvent): void {
  event.stopPropagation();
  const handle = event.currentTarget as HTMLElement;
  handle.setPointerCapture?.(event.pointerId);
  const rendered = renderedSize(handle) || resizedSize.value;
  if (rendered) startDrag(event, rendered);
}

function resizeHandleFromKey(event: KeyboardEvent): void {
  resizeFromKey(event, renderedSize(event.currentTarget as HTMLElement));
}

// From lg the resize handle takes the inner edge: the drawer's own grip,
// drawn in its middle, would sit next to it. Below lg a top or bottom
// drawer keeps it. A side drawer never draws one: it is not dragged away
// (`dismissible` is off), and the grip took 22px of a phone's gutter.
// Important: vaul's unlayered `[data-vaul-handle]` rule outranks a utility.
const DESKTOP_HIDDEN_GRIP = "lg:hidden!";

// The body scrolls, not the whole drawer: the header (title, row steps,
// close) stays in view. The body reaches over the container's side padding
// so its scrollbar sits on the drawer's edge, and carries the bottom padding
// a form's sticky footer reaches over to sit flush with it (see Form.vue).
// The body is a flex column: a body component whose root grows (`flex-1`)
// fills the drawer's height while its content is short, so a
// `<DmsContainerFooter>` at its end sits at the bottom, and it scrolls past
// it while long.
const DRAWER_CONTAINER_CLASS =
  "[--dms-form-foot-pb:1rem] min-h-0 overflow-y-hidden pb-0";
const DRAWER_BODY_CLASS =
  "flex min-h-0 flex-col overflow-y-auto -mx-4 px-4 pb-4";

const drawerUi = computed(() => ({
  ...(contentClass.value && { content: contentClass.value }),
  overlay: CLOSING_OVERLAY_CLASS,
  handle: DESKTOP_HIDDEN_GRIP,
  header: "border-b border-default flex shrink-0 items-center gap-4 pb-4",
  container: DRAWER_CONTAINER_CLASS,
  body: DRAWER_BODY_CLASS,
}));

// Let a DmsForm rendered in the body drop its DmsCard (the drawer is the surface).
provide("dmsFormContainer", true);

const { executeGuards, clearGuards } = useLeaveGuard();

const isOpen = defineModel<boolean>("open", { default: true });
const isContentLoading = ref(true);
let closePromise: Promise<void> | null = null;

async function tryClose() {
  if (isContentLoading.value) return;
  if (closePromise) return;

  closePromise = (async () => {
    const canClose = await executeGuards(props.containerId);
    if (!canClose) {
      return;
    }
    clearGuards(props.containerId);
    isOpen.value = false;
    emit("close");
  })();

  await closePromise;
  closePromise = null;
}

// A form in the body closes through the guards (its Cancel button) and
// registers its own under this id, whatever component wraps it.
provide(DMS_CONTAINER_KEY, { id: props.containerId, close: tryClose });

// Another page (Back, a link): the drawer belongs to the one left. Its
// unsaved changes were already confirmed by the navigation guard.
const route = useDmsRoute();
watch(
  () => route.path,
  () => {
    clearGuards(props.containerId);
    isOpen.value = false;
    emit("close");
  },
);

function handleSuccess(result?: unknown) {
  clearGuards(props.containerId);
  isOpen.value = false;
  emit("close", result);
}

function onContentPending() {
  isContentLoading.value = true;
}

function onContentResolve() {
  isContentLoading.value = false;
}

const { t } = useI18n();
</script>

<template>
  <UDrawer
    v-model:open="isOpen"
    :direction="direction"
    :description="description"
    :title="title"
    :dismissible="false"
    :handle="!isSide"
    :ui="drawerUi"
    :content="contentProps"
    @close:prevent="tryClose"
  >
    <template #header>
      <!-- Positioned against the drawer's content, which is fixed. From lg,
        a drag or the arrow keys resize the drawer, a double-click gives it
        its default size back. -->
      <div
        role="separator"
        tabindex="0"
        data-dms-drawer-handle
        :aria-orientation="handleOrientation"
        :aria-label="t('dms.drawer.resize')"
        :aria-valuenow="resizedSize"
        :aria-valuemin="sizeBounds.minSize"
        :aria-valuemax="sizeBounds.maxSize"
        :data-dragging="isDragging || undefined"
        class="group/handle absolute z-10 hidden touch-none outline-none select-none lg:block"
        :class="handleClass"
        @pointerdown="startHandleDrag"
        @pointermove="drag"
        @pointerup="endDrag"
        @pointercancel="endDrag"
        @lostpointercapture="endDrag"
        @keydown="resizeHandleFromKey"
        @dblclick="resetSize"
      >
        <span
          aria-hidden="true"
          class="group-hover/handle:bg-primary group-focus-visible/handle:bg-primary absolute transition-colors motion-reduce:transition-none"
          :class="[handleLineClass, { 'bg-primary': isDragging }]"
        />
      </div>
      <!-- Same container as the body so the title aligns with the form. On
        phones the drawer's own padding is the 16px gutter: the container
        drops its own. -->
      <UContainer
        class="flex w-full flex-1 items-start gap-3"
        :class="containerClass"
      >
        <DmsIconWell v-if="icon" :icon="icon" :tone="color" />
        <div v-if="headerComponent" class="min-w-0 flex-1">
          <!-- The header component draws the visible heading (the row
            header's names the row): the dialog's own title only labels it,
            without a second heading of the same text. -->
          <VisuallyHidden>
            <DialogTitle as="span">{{ title }}</DialogTitle>
            <DialogDescription>{{ description }}</DialogDescription>
          </VisuallyHidden>
          <Suspense>
            <component :is="headerComponent" v-bind="headerComponentOptions" />
          </Suspense>
        </div>
        <div v-else class="min-w-0 flex-1 self-center">
          <DialogTitle
            as="h2"
            class="text-highlighted text-[17px] leading-[1.3] font-[650] tracking-[-0.02em]"
          >
            {{ title }}
          </DialogTitle>
          <DialogDescription
            v-if="description"
            class="text-muted mt-1 text-[13px]"
          >
            {{ description }}
          </DialogDescription>
          <VisuallyHidden v-else>
            <DialogDescription />
          </VisuallyHidden>
        </div>
        <UButton
          icon="i-ph-x"
          color="neutral"
          variant="ghost"
          size="sm"
          square
          aria-label="Close"
          :disabled="isContentLoading"
          @click="tryClose"
        />
      </UContainer>
    </template>
    <template #body>
      <!-- A size container: what the body lays out by width (a form's
        columns, a list's) follows the drawer as it is resized. -->
      <UContainer
        class="@container flex flex-1 flex-col"
        :class="containerClass"
      >
        <Suspense @pending="onContentPending" @resolve="onContentResolve">
          <component
            :is="component"
            :key="componentKey"
            v-bind="componentOptions"
            :container-id="containerId"
            @success="handleSuccess"
          />
          <template #fallback>
            <div :class="CONTAINER_SKELETON_CLASS" aria-busy="true">
              <div
                v-for="field in CONTAINER_SKELETON_FIELDS"
                :key="field"
                class="flex flex-col gap-2"
              >
                <USkeleton
                  :aria-label="t('dms.a11y.loading')"
                  class="h-3 w-24"
                />
                <USkeleton
                  :aria-label="t('dms.a11y.loading')"
                  class="h-8 w-full"
                />
              </div>
            </div>
          </template>
        </Suspense>
      </UContainer>
    </template>
  </UDrawer>
</template>
