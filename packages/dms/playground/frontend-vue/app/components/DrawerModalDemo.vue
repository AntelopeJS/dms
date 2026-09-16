<script setup lang="ts">
import DrawerModalDemoContent from "./DrawerModalDemoContent.vue";

const { open: openDrawer } = useDrawer();
const { open: openModal } = useModal();

const lastResult = ref("");

function describe(kind: string, value: unknown) {
  lastResult.value = value
    ? `${kind} confirmed → ${JSON.stringify(value)}`
    : `${kind} dismissed without a result`;
}

async function showDrawer() {
  const { result } = openDrawer({
    title: "Demo drawer",
    description: "Opened from a consumer module via useDrawer()",
    direction: "right",
    component: DrawerModalDemoContent,
    componentOptions: {
      message:
        "This drawer is the DMS-themed DynamicDrawer container, opened through the public useDrawer() composable.",
    },
  });
  describe("Drawer", await result);
}

async function showModal() {
  const { result } = openModal({
    title: "Demo modal",
    description: "Opened from a consumer module via useModal()",
    component: DrawerModalDemoContent,
    componentOptions: {
      message:
        "This modal is the DMS-themed DynamicModal container, opened through the public useModal() composable.",
    },
  });
  describe("Modal", await result);
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <p class="text-muted">
      The <code>useDrawer()</code> and <code>useModal()</code> composables are
      auto-imported from the layer. They open DMS-themed containers and return a
      <code>result</code> promise that settles when the container is dismissed.
    </p>
    <div class="flex flex-wrap gap-3">
      <UButton
        size="lg"
        icon="i-ph-sidebar-simple"
        label="Open drawer"
        @click="showDrawer"
      />
      <UButton
        size="lg"
        color="neutral"
        variant="subtle"
        icon="i-ph-browser"
        label="Open modal"
        @click="showModal"
      />
    </div>
    <UAlert
      v-if="lastResult"
      color="primary"
      variant="subtle"
      icon="i-ph-check-circle"
      :title="lastResult"
    />
  </div>
</template>
