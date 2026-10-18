<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { usePageLive } from "../../composables/live/usePageLive";
import { pageReadAt } from "../../build/composables/live/pageReadClock";
import { useUpdatedLabel } from "../../build/composables/live/useUpdatedLabel";
import {
  type PageToolbarSize,
  providePageToolbar,
} from "../../build/composables/page-toolbar/pageToolbarContext";
import { PAGE_TOOLBAR_CONTROL_HEIGHT_CLASSES } from "../../build/composables/page-toolbar/toolbarControlHeight";
import { refreshPageBlocks } from "../../utils/blockRefresh";
import type { DefaultComponentProps } from "../../../../dms-core/app/types/component";

interface PageToolbarBlockProps extends DefaultComponentProps {
  /** The size of its controls, unless a child sets its own. */
  size?: PageToolbarSize;
  /** Without a live toggle on screen: "updated N s ago". */
  showUpdatedAt?: boolean;
  /** Without a live toggle on screen: the button reading the page again. */
  refresh?: boolean;
}

const props = withDefaults(defineProps<PageToolbarBlockProps>(), {
  size: "sm",
  showUpdatedAt: true,
  refresh: true,
});

// The updated label at the live toggle's steps, so it reads alike with or
// without `live`; the refresh button stands as tall as the toggle's pill.
const STATUS_TEXT_CLASSES: Record<PageToolbarSize, string> = {
  xs: "text-[11.5px]",
  sm: "text-[12.5px]",
  md: "text-[13px]",
};
const REFRESH_ICON = "i-ph-arrow-clockwise";

useComponentEvent(props.componentId);
useWatch(props.watchActions || [], props.componentId);

const { t } = useI18n();
const toolbar = providePageToolbar(computed(() => props.size));
const live = usePageLive();
const statusTextClass = computed(() => STATUS_TEXT_CLASSES[props.size]);
const heightClass = computed(
  () => PAGE_TOOLBAR_CONTROL_HEIGHT_CLASSES[props.size],
);

// The browser's clock: the server and the hydrating render draw no status.
const isMounted = ref(false);
onMounted(() => (isMounted.value = true));

// A live page's own clock, else the page's last read.
const updatedLabel = useUpdatedLabel(
  () => live.lastUpdatedAt.value ?? pageReadAt.value,
  props.showUpdatedAt,
);

// The live toggle says when the page was updated, and more: the toolbar
// only does where there is none to see.
const showsStatus = computed(
  () =>
    isMounted.value &&
    (props.showUpdatedAt || props.refresh) &&
    !(live.isEnabled.value && toolbar.hasLiveToggle.value),
);

const isRefreshing = ref(false);
async function refreshPage() {
  if (isRefreshing.value) return;
  isRefreshing.value = true;
  try {
    await refreshPageBlocks();
  } finally {
    isRefreshing.value = false;
  }
}
</script>

<template>
  <div
    class="dms-page-toolbar flex w-full flex-wrap items-center justify-end gap-x-3 gap-y-2"
  >
    <slot />
    <span class="dms-page-toolbar__spacer" aria-hidden="true" />
    <div
      v-if="showsStatus"
      class="dms-page-toolbar__status flex items-center gap-1"
    >
      <span
        v-if="props.showUpdatedAt && updatedLabel"
        class="text-muted tabular-nums"
        :class="statusTextClass"
        aria-live="off"
      >
        {{ updatedLabel }}
      </span>
      <UButton
        v-if="props.refresh"
        data-action="refresh"
        color="neutral"
        variant="ghost"
        square
        :size="props.size"
        :class="heightClass"
        :icon="REFRESH_ICON"
        :loading="isRefreshing"
        :aria-label="t('dms.live.refresh')"
        :title="t('dms.live.refresh')"
        @click="refreshPage"
      />
    </div>
  </div>
</template>

<style>
/* One order whatever the children's: the leading blocks, the spacer, the
   updated label or the live toggle, then the period. A child is matched by
   the block it draws, through the wrappers a role preview may add. Wrapped
   onto more lines, the trailing controls stay on the right. */
.dms-page-toolbar > * {
  order: 0;
}
.dms-page-toolbar > .dms-page-toolbar__spacer {
  order: 1;
  flex: 1 1 0%;
}
.dms-page-toolbar > .dms-page-toolbar__status,
.dms-page-toolbar > :is(.dms-live-toggle, :has(.dms-live-toggle)) {
  order: 2;
}
.dms-page-toolbar > :is(.dms-period-selector, :has(.dms-period-selector)) {
  order: 3;
}
</style>
