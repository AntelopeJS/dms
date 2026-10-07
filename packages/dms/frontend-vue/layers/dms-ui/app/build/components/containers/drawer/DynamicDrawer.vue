<script setup lang="ts">
import type { Component } from "vue";
import { DialogDescription, DialogTitle, VisuallyHidden } from "reka-ui";
import type {
  ContainerColor,
  DrawerDirection,
} from "../../../../composables/containers/types";
import DmsIconWell from "../../../../components/icon-well/IconWell.vue";
import { CONTAINER_SKELETON_FIELDS } from "../constants";
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
  icon?: string;
  color?: ContainerColor;
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
  icon: undefined,
  color: "primary",
});
const emit = defineEmits<DynamicDrawerEmits>();

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
</script>

<template>
  <UDrawer
    v-model:open="isOpen"
    :direction="direction"
    :description="description"
    :title="title"
    :dismissible="false"
    :ui="{
      header: 'border-b border-default flex shrink-0 items-center gap-4 pb-4',
      // The scroll area's bottom padding: a form's sticky footer sits flush
      // with the drawer's edge (see Form.vue).
      container: '[--dms-form-foot-pb:1rem]',
    }"
    @close:prevent="tryClose"
  >
    <template #header>
      <!-- Same container as the body so the title aligns with the form. On
        phones the drawer's own padding is the 16px gutter: the container
        drops its own. -->
      <UContainer class="flex w-full flex-1 items-start gap-3 max-sm:px-0">
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
      </UContainer>
    </template>
    <template #body>
      <UContainer class="max-sm:px-0">
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
                <USkeleton class="h-3 w-24" />
                <USkeleton class="h-8 w-full" />
              </div>
            </div>
          </template>
        </Suspense>
      </UContainer>
    </template>
  </UDrawer>
</template>
