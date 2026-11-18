<script setup lang="ts">
import { useMockupShortcutKeys } from "../../composables/block-preview/useMockupShortcutKeys";

/**
 * What the canvas is waiting for while a tool is armed: a click to place a
 * comment, or a click to place the armed block, and the key that cancels it.
 */
defineProps<{
  mode: { kind: "comment" } | { kind: "place"; name: string };
}>();

const { t } = useI18n();
const { keysOf } = useMockupShortcutKeys();
</script>

<template>
  <div
    class="bg-elevated text-default ring-default pointer-events-none flex items-center gap-1.5 rounded-full px-3 py-1 text-xs shadow-md ring-1"
    role="status"
    :data-dms-mockup-banner="mode.kind"
  >
    <span>
      {{
        mode.kind === "comment"
          ? t("dms.mockup.banner_comment")
          : t("dms.mockup.banner_place", { name: mode.name })
      }}
    </span>
    <span class="text-dimmed" aria-hidden="true">·</span>
    <UKbd v-for="key in keysOf('cancel')" :key="key" :value="key" size="sm" />
    <span>{{ t("dms.mockup.banner_cancel") }}</span>
  </div>
</template>
