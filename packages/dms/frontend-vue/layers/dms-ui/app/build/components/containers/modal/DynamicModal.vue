<script setup lang="ts">
import type { Component } from "vue";
import { DialogDescription, DialogTitle, VisuallyHidden } from "reka-ui";
import type { ModalSize } from "../../../../types/modal";

interface DynamicModalProps {
  title: string;
  description?: string;
  size?: ModalSize;
  containerId: string;
  component: Component;
  componentOptions?: Record<string, unknown>;
  headerComponent?: Component;
  headerComponentOptions?: Record<string, unknown>;
}

interface DynamicModalEmits {
  (e: "close", result?: unknown): void;
}

const props = defineProps<DynamicModalProps>();
const emit = defineEmits<DynamicModalEmits>();

// Let a DmsForm rendered in the body drop its DmsCard (the modal is the surface).
provide("dmsFormContainer", true);

// UModal has no size variant, so map our ModalSize onto a max-width. Form
// modals default wider than Nuxt UI's max-w-lg for breathing room.
const SIZE_ORDER = ["sm", "md", "lg", "xl", "2xl", "3xl", "4xl", "5xl"];
const SIZE_MAX_W: Record<string, string> = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-md",
  lg: "sm:max-w-lg",
  xl: "sm:max-w-xl",
  "2xl": "sm:max-w-2xl",
  "3xl": "sm:max-w-3xl",
  "4xl": "sm:max-w-4xl",
  "5xl": "sm:max-w-5xl",
};
// Form modals shouldn't be narrower than this; callers asking for a bigger
// size are still honored.
const MIN_SIZE = "3xl";
const contentClass = computed(() => {
  const requested = props.size ?? MIN_SIZE;
  const idx = SIZE_ORDER.indexOf(requested);
  const minIdx = SIZE_ORDER.indexOf(MIN_SIZE);
  const size = idx > minIdx ? requested : MIN_SIZE;
  return SIZE_MAX_W[size] ?? "sm:max-w-3xl";
});

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
</script>

<template>
  <UModal
    v-model:open="isOpen"
    :description="description"
    :title="title"
    :dismissible="false"
    :ui="{ content: contentClass }"
    @close:prevent="tryClose"
  >
    <template #header>
      <div class="flex w-full items-center justify-between gap-4">
        <div v-if="headerComponent" class="flex-1">
          <VisuallyHidden>
            <DialogTitle>{{ title }}</DialogTitle>
            <DialogDescription>{{ description }}</DialogDescription>
          </VisuallyHidden>
          <Suspense>
            <component :is="headerComponent" v-bind="headerComponentOptions" />
          </Suspense>
        </div>
        <div v-else class="flex-1">
          <DialogTitle as="h2" class="text-highlighted font-semibold">
            {{ title }}
          </DialogTitle>
          <DialogDescription v-if="description" class="text-muted text-sm">
            {{ description }}
          </DialogDescription>
          <VisuallyHidden v-else>
            <DialogDescription />
          </VisuallyHidden>
        </div>
        <UButton
          icon="i-lucide-x"
          color="neutral"
          variant="ghost"
          aria-label="Close"
          @click="tryClose"
        />
      </div>
    </template>
    <template #body>
      <Suspense @pending="onContentPending" @resolve="onContentResolve">
        <component
          :is="component"
          v-bind="componentOptions"
          :container-id="containerId"
          @success="handleSuccess"
        />
      </Suspense>
    </template>
  </UModal>
</template>
