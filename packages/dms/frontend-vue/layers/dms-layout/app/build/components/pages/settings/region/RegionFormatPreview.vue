<script setup lang="ts">
import { useUserRegionalPreferences } from "#dms-core/app/composables/user/useUserRegionalPreferences";
import { formatDate, formatNumber } from "#dms-core/app/utils/formatter";
import { regionalDateTimeFormat } from "#dms-core/app/utils/regional";
import { timeZoneLabel } from "./timeZones";

interface FormatSample {
  labelKey: string;
  value: string;
}

const PREVIEW_NUMBER = 12480.5;
const PREVIEW_FRACTION_DIGITS = 2;

const { locale, t } = useI18n();
const { timeZone } = useUserRegionalPreferences();

// Frozen at mount: the preview shows formats, not a ticking clock.
const previewDate = new Date();

// Recomputed from the session user, which the dashboard reads again after
// each save of the Language & region form.
const samples = computed<FormatSample[]>(() => {
  const tag = locale.value;
  return [
    {
      labelKey: "page.settings.region.format_date",
      value: formatDate(previewDate, tag) ?? "",
    },
    {
      labelKey: "page.settings.region.format_datetime",
      value: regionalDateTimeFormat(tag, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(previewDate),
    },
    {
      labelKey: "page.settings.region.format_time",
      value: regionalDateTimeFormat(tag, {
        hour: "2-digit",
        minute: "2-digit",
      }).format(previewDate),
    },
    {
      labelKey: "page.settings.region.format_number",
      value: String(
        formatNumber(PREVIEW_NUMBER, tag, {
          minimumFractionDigits: PREVIEW_FRACTION_DIGITS,
        }),
      ),
    },
  ];
});
</script>

<template>
  <DmsSection
    title="$page.settings.region.preview_title"
    :description="
      t('page.settings.region.preview_description', {
        zone: timeZoneLabel(timeZone),
      })
    "
  >
    <!-- Cells as wide as their sample, packed and stretched row by row:
         fixed columns overlapped the longer samples (a full date and time)
         at every width. The hairlines are each cell's top-left shadow,
         clipped by the card on its outer edges, so they follow however the
         cells wrap. -->
    <div class="flex flex-wrap bg-(--dms-bg-muted)">
      <div
        v-for="sample in samples"
        :key="sample.labelKey"
        class="min-w-0 flex-auto px-[18px] py-3 shadow-[-1px_-1px_0_var(--ui-border-muted)]"
      >
        <DmsEyebrow
          as="span"
          size="xs"
          class="mb-1 block"
          :label="t(sample.labelKey)"
        />
        <b
          class="text-highlighted font-mono text-[13px] font-semibold wrap-break-word"
        >
          {{ sample.value }}
        </b>
      </div>
    </div>
  </DmsSection>
</template>
