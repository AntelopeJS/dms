<script setup lang="ts">
import type { PreviewIssue } from "../../utils/blockPreview";

defineOptions({ inheritAttrs: false });

const props = defineProps<{ issue: PreviewIssue }>();

const { t } = useI18n();
const message = computed(() =>
  t(`dms.block_preview.${props.issue.key}`, {
    name: props.issue.name,
    value: props.issue.value ?? "",
  }),
);
</script>

<template>
  <UAlert
    color="warning"
    variant="subtle"
    icon="i-ph-warning"
    :title="message"
    data-dms-preview-issue
  />
</template>
