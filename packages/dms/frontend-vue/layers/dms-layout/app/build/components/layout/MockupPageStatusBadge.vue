<script setup lang="ts">
import type { BadgeProps } from "@nuxt/ui";
import type { PreviewPageStatus } from "#dms-ui/app/entries/utils/blockPreview";

/**
 * What a page of a whole-platform mockup is beside the live app, as a small
 * badge: Live, muted, for a live page shown untouched; Edited for a live page
 * the mockup changes; New for a page the mockup adds.
 */
defineProps<{ status: PreviewPageStatus }>();

const LOOKS: Record<
  PreviewPageStatus,
  Pick<BadgeProps, "color" | "variant">
> = {
  live: { color: "neutral", variant: "outline" },
  edited: { color: "warning", variant: "soft" },
  new: { color: "success", variant: "soft" },
};

const { t } = useI18n();
</script>

<template>
  <UBadge
    v-bind="LOOKS[status]"
    size="sm"
    class="shrink-0 px-1.5 py-0 text-[10px] leading-4 font-medium"
    :label="t(`dms.mockup.page_status.${status}`)"
    :title="t(`dms.mockup.page_status.${status}_hint`)"
    :data-dms-mockup-page-status="status"
  />
</template>
