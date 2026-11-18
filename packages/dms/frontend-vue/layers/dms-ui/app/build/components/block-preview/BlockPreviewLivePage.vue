<script setup lang="ts">
import { bareFrameUrl } from "../../utils/liveFrame";

/**
 * A live page a mockup shows as it is: the dashboard's own route in a frame,
 * drawn bare, with its real data, under the mockup's sidebar and top bar.
 * Nothing in it reacts to a click; it scrolls.
 */
const props = defineProps<{ path: string }>();

const { t } = useI18n();
const src = computed(() => bareFrameUrl(props.path));
</script>

<template>
  <iframe
    :src="src"
    :title="t('dms.mockup.live_page_title', { path })"
    class="block h-[calc(max(var(--dms-preview-min-height,0px),48rem)-var(--ui-header-height))] w-full border-0"
    data-dms-preview-live-page
  />
</template>
