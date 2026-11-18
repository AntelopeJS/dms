<script setup lang="ts">
import type { MockupVersions } from "../../composables/block-preview/useMockupVersions";
import MockupVersionBanner from "./MockupVersionBanner.vue";

/** The bars over the canvas: a write being retried, a request that failed, and the version previewed. */
defineProps<{
  hasSaveFailed: boolean;
  hasRequestFailed: boolean;
  history: MockupVersions;
}>();

const { t } = useI18n();
</script>

<template>
  <UAlert
    v-if="hasSaveFailed"
    color="error"
    variant="subtle"
    icon="i-ph-warning-circle"
    :title="t('dms.mockup.save_retrying')"
    data-dms-mockup-save-retrying
  />
  <UAlert
    v-if="hasRequestFailed"
    color="error"
    variant="subtle"
    icon="i-ph-warning-circle"
    :title="t('dms.mockup.request_failed')"
  />
  <MockupVersionBanner
    v-if="history.previewing.value"
    :seq="history.previewing.value.seq"
    :has-newer="history.hasNewer.value"
    :is-restoring="history.isRestoring.value"
    @restore="history.restore"
    @back="history.backToCurrent"
  />
</template>
