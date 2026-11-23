<script setup lang="ts">
import type { MockupPins } from "../../composables/block-preview/useMockupPins";
import MockupModeBanner from "./MockupModeBanner.vue";
import MockupPinTray from "./MockupPinTray.vue";
import MockupResolveBar from "./MockupResolveBar.vue";
import MockupShortcutTip from "./MockupShortcutTip.vue";

defineProps<{
  /** A page is on screen: the ✕ shows. */
  hasOpenPage: boolean;
  /** In Preview or on a past version: only the ✕ stays over the canvas. */
  isLocked: boolean;
  pins: MockupPins;
  mode: { kind: "comment" } | { kind: "place"; name: string } | undefined;
  isUnclaimed: boolean;
  isResolving: boolean;
}>();
const emit = defineEmits<{ close: []; resolve: [] }>();

const { t } = useI18n();
</script>

<template>
  <div v-if="hasOpenPage" class="absolute end-3 top-3 z-40">
    <MockupShortcutTip
      :label="t('dms.mockup.close_page')"
      shortcut="close_page"
    >
      <UButton
        size="xl"
        color="neutral"
        variant="outline"
        icon="i-ph-x-bold"
        class="rounded-full shadow-md"
        :aria-label="t('dms.mockup.close_page')"
        data-dms-mockup-close-page
        @click="emit('close')"
      />
    </MockupShortcutTip>
  </div>
  <template v-if="!isLocked">
    <MockupPinTray :pins="pins" class="absolute start-3 top-3 z-40" />
    <div
      v-if="mode"
      class="pointer-events-none absolute inset-x-0 top-3 z-40 flex justify-center"
    >
      <MockupModeBanner :mode="mode" />
    </div>
    <div
      class="pointer-events-none absolute inset-x-0 bottom-4 z-40 flex justify-center"
    >
      <MockupResolveBar
        class="pointer-events-auto"
        :count="pins.openCount.value"
        :is-unclaimed="isUnclaimed"
        :is-resolving="isResolving"
        @resolve="emit('resolve')"
      />
    </div>
  </template>
</template>
