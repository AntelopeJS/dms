<script setup lang="ts">
import type { Component } from "vue";

type DrawerDirection = "top" | "bottom" | "left" | "right";

interface DynamicDrawerProps {
  title: string;
  description?: string;
  containerId: string;
  component: Component;
  componentOptions?: Record<string, unknown>;
  headerComponent?: Component;
  headerComponentOptions?: Record<string, unknown>;
  direction?: DrawerDirection;
}

interface DynamicDrawerEmits {
  (e: "close", result?: unknown): void;
}

const props = withDefaults(defineProps<DynamicDrawerProps>(), {
  direction: "bottom",
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
      header:
        'border-b border-default flex items-center justify-between gap-4 pb-4',
    }"
    @close:prevent="tryClose"
  >
    <template #header>
      <!-- Same container as the body so the title aligns with the form -->
      <UContainer class="flex w-full flex-1 items-center justify-between gap-4">
        <div v-if="headerComponent" class="flex-1">
          <Suspense>
            <component :is="headerComponent" v-bind="headerComponentOptions" />
          </Suspense>
        </div>
        <div v-else class="flex-1">
          <h2 class="text-highlighted font-semibold">{{ title }}</h2>
          <p v-if="description" class="text-muted text-sm">
            {{ description }}
          </p>
        </div>
        <UButton
          icon="i-lucide-x"
          color="neutral"
          variant="ghost"
          aria-label="Close"
          @click="tryClose"
        />
      </UContainer>
    </template>
    <template #body>
      <UContainer>
        <Suspense @pending="onContentPending" @resolve="onContentResolve">
          <component
            :is="component"
            v-bind="componentOptions"
            :container-id="containerId"
            @success="handleSuccess"
          />
        </Suspense>
      </UContainer>
    </template>
  </UDrawer>
</template>
