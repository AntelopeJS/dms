<script setup lang="ts">
import type { Component } from "vue";
import { DialogDescription, DialogTitle, VisuallyHidden } from "reka-ui";
import type { ModalSize } from "../../../../types/modal";
import type { ContainerColor } from "../../../../composables/containers/types";
import DmsIconWell from "../../../../components/icon-well/IconWell.vue";
import { CONTAINER_SKELETON_FIELDS } from "../constants";
import { DMS_CONTAINER_KEY } from "../../../composables/containers/context";

interface DynamicModalProps {
  title: string;
  description?: string;
  size?: ModalSize;
  containerId: string;
  component: Component;
  componentOptions?: Record<string, unknown>;
  /** Mounts the body component anew when it changes. */
  componentKey?: string;
  headerComponent?: Component;
  headerComponentOptions?: Record<string, unknown>;
  icon?: string;
  color?: ContainerColor;
}

interface DynamicModalEmits {
  (e: "close", result?: unknown): void;
}

const props = withDefaults(defineProps<DynamicModalProps>(), {
  description: undefined,
  size: undefined,
  componentOptions: undefined,
  headerComponent: undefined,
  headerComponentOptions: undefined,
  icon: undefined,
  color: "primary",
});
const emit = defineEmits<DynamicModalEmits>();

// Let a DmsForm rendered in the body drop its DmsCard (the modal is the surface).
provide("dmsFormContainer", true);

// UModal has no size variant, so map our ModalSize onto a max-width. Form
// modals default wider than Nuxt UI's max-w-lg for breathing room.
const SIZE_ORDER: ModalSize[] = [
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
const SIZE_CONTENT: Record<ModalSize, string> = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-md",
  lg: "sm:max-w-lg",
  xl: "sm:max-w-xl",
  "2xl": "sm:max-w-2xl",
  "3xl": "sm:max-w-3xl",
  "4xl": "sm:max-w-4xl",
  "5xl": "sm:max-w-5xl",
  full: "sm:max-w-5xl h-[calc(100dvh-4rem)]",
};
// Form modals shouldn't be narrower than this; callers asking for a bigger
// size are still honored.
const MIN_SIZE: ModalSize = "3xl";

const resolvedSize = computed(() => {
  const requested = props.size ?? MIN_SIZE;
  return SIZE_ORDER.indexOf(requested) > SIZE_ORDER.indexOf(MIN_SIZE)
    ? requested
    : MIN_SIZE;
});

// A divided head: the body below is a form, not a continuation of the title.
const modalUi = computed(() => ({
  content: SIZE_CONTENT[resolvedSize.value],
  header: "border-b border-default pb-4 shrink-0",
  // The body's bottom and side padding: a form's sticky footer sits flush
  // with the modal's edges (see Form.vue).
  body: "[--dms-form-foot-pb:1.25rem] [--dms-form-foot-px:1.25rem]",
}));

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

// Another page (Back, a link): the modal belongs to the one left. Its
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
  <UModal
    v-model:open="isOpen"
    :description="description"
    :title="title"
    :dismissible="false"
    :ui="modalUi"
    @close:prevent="tryClose"
  >
    <template #header>
      <div class="flex w-full items-start gap-3">
        <DmsIconWell v-if="icon" :icon="icon" :tone="color" />
        <div v-if="headerComponent" class="min-w-0 flex-1">
          <VisuallyHidden>
            <DialogTitle>{{ title }}</DialogTitle>
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
      </div>
    </template>
    <template #body>
      <Suspense @pending="onContentPending" @resolve="onContentResolve">
        <component
          :is="component"
          :key="componentKey"
          v-bind="componentOptions"
          :container-id="containerId"
          @success="handleSuccess"
        />
        <template #fallback>
          <div class="grid gap-4 sm:grid-cols-2" aria-busy="true">
            <div
              v-for="field in CONTAINER_SKELETON_FIELDS"
              :key="field"
              class="flex flex-col gap-2"
            >
              <USkeleton :aria-label="t('dms.a11y.loading')" class="h-3 w-24" />
              <USkeleton
                :aria-label="t('dms.a11y.loading')"
                class="h-8 w-full"
              />
            </div>
          </div>
        </template>
      </Suspense>
    </template>
  </UModal>
</template>
