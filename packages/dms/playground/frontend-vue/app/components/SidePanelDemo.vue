<script setup lang="ts">
/**
 * Demo body of a docked side panel (see `registerSidePanel`). The DMS docks it
 * on the right of every page and shrinks the page to make room; the panel
 * follows navigations without remounting, which the draft and the mount time
 * below make visible.
 */
import { useSidePanelDemoOpen } from "../composables/useSidePanelDemo";

const isOpen = useSidePanelDemoOpen();
const route = useDmsRoute();
const draft = ref("");
const mountedAt = new Date().toLocaleTimeString();
</script>

<template>
  <div class="flex h-full flex-col">
    <header
      class="border-default flex h-(--ui-header-height) shrink-0 items-center gap-2 border-b px-4"
    >
      <UIcon name="i-ph-sidebar-simple-light" class="text-primary size-5" />
      <h2
        class="text-highlighted min-w-0 flex-1 truncate text-sm font-semibold"
      >
        {{ $t("demo.side_panel.title") }}
      </h2>
      <UButton
        icon="i-ph-x-light"
        variant="ghost"
        color="neutral"
        size="sm"
        :aria-label="$t('demo.side_panel.close')"
        @click="isOpen = false"
      />
    </header>

    <div class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
      <p class="text-muted text-sm">
        {{ $t("demo.side_panel.description") }}
      </p>
      <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <dt class="text-muted">{{ $t("demo.side_panel.mounted_at") }}</dt>
        <dd class="text-highlighted font-mono">{{ mountedAt }}</dd>
        <dt class="text-muted">{{ $t("demo.side_panel.current_page") }}</dt>
        <dd class="text-highlighted truncate font-mono">{{ route.path }}</dd>
      </dl>
      <UTextarea
        v-model="draft"
        :placeholder="$t('demo.side_panel.draft_placeholder')"
        :rows="4"
        autoresize
      />
    </div>
  </div>
</template>
