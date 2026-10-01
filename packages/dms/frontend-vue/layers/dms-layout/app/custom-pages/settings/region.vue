<script setup lang="ts">
import UIcon from "@nuxt/ui/runtime/vue/components/Icon.vue";
import { useUserRegionalPreferences } from "#dms-core/app/composables/user/useUserRegionalPreferences";
import {
  formatDate,
  formatNumber,
  formatPrice,
} from "#dms-core/app/utils/formatter";
import {
  localeWeekStart,
  regionalDateTimeFormat,
} from "#dms-core/app/utils/regional";
import { usePageHeaderActions } from "../../composables/layout/usePageHeaderActions";
import {
  buildTimeZoneOptions,
  listTimeZones,
  timeZoneLabel,
  timeZoneOffset,
} from "../../composables/settings/region/timeZones";
import {
  type RegionSettingsValues,
  useRegionSettings,
} from "../../composables/settings/region/useRegionSettings";

interface FormatSample {
  labelKey: string;
  value: string;
}

interface SegmentOption {
  label: string;
  value: string | number;
}

type ChoiceField = "weekStart" | "timeFormat" | "dateFormat";

// The segmented controls and the zone picker hold "auto" for null.
const AUTO = "auto";
const PREVIEW_NUMBER = 12480.5;
const PREVIEW_AMOUNT = 1127;
const PREVIEW_FRACTION_DIGITS = 2;
const SUNDAY = 0;
const MONDAY = 1;
const SATURDAY = 6;
// A Monday and a Sunday, to name weekdays in the reader's language.
const WEEKDAY_SAMPLES: Record<number, Date> = {
  [SUNDAY]: new Date(Date.UTC(2026, 0, 4, 12)),
  [MONDAY]: new Date(Date.UTC(2026, 0, 5, 12)),
  [SATURDAY]: new Date(Date.UTC(2026, 0, 3, 12)),
};
const WEEK_STARTS = [MONDAY, SUNDAY, SATURDAY];

const { locale, t } = useI18n();
const { uniqueLocales } = useUniqueLocales();
const { preferences, detectedTimeZone, timeZone } =
  useUserRegionalPreferences();
const { states, save } = useRegionSettings();

// Frozen at mount: the preview shows formats, not a ticking clock.
const previewDate = new Date();

const languageOptions = computed(() =>
  uniqueLocales.value.map((lang) => ({ label: lang.name, value: lang.code })),
);
const localeTag = computed(() => locale.value.toUpperCase());

const timeZoneOptions = computed(() => [
  {
    value: AUTO,
    label: t("page.settings.region.time_zone_auto", {
      zone: timeZoneLabel(detectedTimeZone),
    }),
    offset: timeZoneOffset(detectedTimeZone, previewDate),
  },
  ...buildTimeZoneOptions(listTimeZones(), previewDate, [
    detectedTimeZone,
    preferences.value.timeZone ?? "",
  ]),
]);

const selectedTimeZone = computed(() => preferences.value.timeZone ?? AUTO);
const isAwayFromBrowser = computed(
  () =>
    !!preferences.value.timeZone &&
    preferences.value.timeZone !== detectedTimeZone,
);

function weekdayName(day: number): string {
  const name = new Intl.DateTimeFormat(locale.value, {
    weekday: "long",
    timeZone: "UTC",
  }).format(WEEKDAY_SAMPLES[day]);
  return name.charAt(0).toLocaleUpperCase(locale.value) + name.slice(1);
}

const autoLabel = computed(() => t("page.settings.region.auto"));

const weekStartOptions = computed<SegmentOption[]>(() => [
  { label: autoLabel.value, value: AUTO },
  ...WEEK_STARTS.map((day) => ({ label: weekdayName(day), value: day })),
]);

const timeFormatOptions = computed<SegmentOption[]>(() => [
  { label: autoLabel.value, value: AUTO },
  { label: t("page.settings.region.time_24"), value: "h23" },
  { label: t("page.settings.region.time_12"), value: "h12" },
]);

const sampleDate = (options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat(locale.value, options).format(previewDate);

const dateFormatOptions = computed<SegmentOption[]>(() => [
  { label: autoLabel.value, value: AUTO },
  {
    label: sampleDate({ day: "2-digit", month: "2-digit", year: "numeric" }),
    value: "numeric",
  },
  {
    label: sampleDate({ day: "numeric", month: "short", year: "numeric" }),
    value: "text",
  },
]);

/** What "Automatic" currently stands for, said in each row's description. */
const autoHints = computed<Record<ChoiceField, string>>(() => ({
  weekStart: weekdayName(localeWeekStart(locale.value)),
  timeFormat: new Intl.DateTimeFormat(locale.value, {
    hour: "numeric",
    minute: "2-digit",
  }).format(previewDate),
  dateFormat: t("page.settings.region.date_auto_hint"),
}));

const choiceValue = (field: ChoiceField) => preferences.value[field] ?? AUTO;

function saveChoice(field: ChoiceField, value: string | number | undefined) {
  const next = value === AUTO || value === undefined ? null : value;
  void save(field, next as RegionSettingsValues[ChoiceField]);
}

function saveTimeZone(value: string): void {
  void save("timeZone", value === AUTO ? null : value);
}

function saveLanguage(value: string): void {
  if (value !== locale.value) void save("language", value);
}

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
    {
      labelKey: "page.settings.region.format_currency",
      value: String(formatPrice(PREVIEW_AMOUNT, tag)),
    },
  ];
});

// Every control on this page saves as soon as it is picked, which the v2
// header states once instead of per control.
usePageHeaderActions(() =>
  h(
    "span",
    {
      class:
        "inline-flex h-7 items-center gap-1.5 rounded-full border border-success/40 bg-success/10 px-[11px] text-xs font-[550] text-success",
    },
    [
      h(UIcon, { name: "i-ph-lightning", class: "size-3.5" }),
      t("page.settings.region.instant"),
    ],
  ),
);
</script>

<template>
  <div>
    <DmsSection
      title="$page.settings.region.language_block_title"
      description="$page.settings.region.language_block_description"
    >
      <DmsFieldRow
        label="$page.settings.region.language_title"
        description="$page.settings.region.language_description"
      >
        <DmsSaveStatus :state="states.language ?? 'idle'" />
        <USelect
          class="w-[260px] max-sm:w-full"
          icon="i-ph-translate"
          :items="languageOptions"
          :model-value="locale"
          :aria-label="t('page.settings.region.language_title')"
          @update:model-value="saveLanguage"
        >
          <template #trailing>
            <span
              class="text-muted border-accented rounded border px-1 font-mono text-[10px] font-semibold"
            >
              {{ localeTag }}
            </span>
            <UIcon name="i-ph-caret-up-down" class="text-dimmed size-4" />
          </template>
        </USelect>
      </DmsFieldRow>
    </DmsSection>

    <DmsSection
      title="$page.settings.region.time_block_title"
      description="$page.settings.region.time_block_description"
    >
      <DmsFieldRow
        label="$page.settings.region.time_zone_title"
        :description="
          preferences.timeZone
            ? t('page.settings.region.time_zone_description')
            : t('page.settings.region.time_zone_detected', {
                zone: timeZoneLabel(detectedTimeZone),
              })
        "
      >
        <DmsSaveStatus :state="states.timeZone ?? 'idle'" />
        <UButton
          v-if="isAwayFromBrowser"
          color="neutral"
          variant="link"
          size="sm"
          icon="i-ph-crosshair"
          :label="
            t('page.settings.region.time_zone_use_detected', {
              zone: timeZoneLabel(detectedTimeZone),
            })
          "
          @click="saveTimeZone(AUTO)"
        />
        <USelectMenu
          class="w-[300px] max-sm:w-full"
          icon="i-ph-globe-hemisphere-west"
          :items="timeZoneOptions"
          :model-value="selectedTimeZone"
          value-key="value"
          label-key="label"
          :filter-fields="['label', 'value', 'offset']"
          :search-input="{
            placeholder: t('page.settings.region.time_zone_search'),
          }"
          :virtualize="{ estimateSize: 32 }"
          :aria-label="t('page.settings.region.time_zone_title')"
          @update:model-value="saveTimeZone"
        >
          <template #item-trailing="{ item }">
            <span class="text-dimmed font-mono text-[11px]">
              {{ item.offset }}
            </span>
          </template>
        </USelectMenu>
      </DmsFieldRow>

      <DmsFieldRow
        label="$page.settings.region.week_start_title"
        :description="
          t('page.settings.region.week_start_description', {
            auto: autoHints.weekStart,
          })
        "
      >
        <DmsSaveStatus :state="states.weekStart ?? 'idle'" />
        <DmsSegmented
          :items="weekStartOptions"
          :model-value="choiceValue('weekStart')"
          :aria-label="t('page.settings.region.week_start_title')"
          @update:model-value="saveChoice('weekStart', $event)"
        />
      </DmsFieldRow>

      <DmsFieldRow
        label="$page.settings.region.time_format_title"
        :description="
          t('page.settings.region.time_format_description', {
            auto: autoHints.timeFormat,
          })
        "
      >
        <DmsSaveStatus :state="states.timeFormat ?? 'idle'" />
        <DmsSegmented
          :items="timeFormatOptions"
          :model-value="choiceValue('timeFormat')"
          :aria-label="t('page.settings.region.time_format_title')"
          @update:model-value="saveChoice('timeFormat', $event)"
        />
      </DmsFieldRow>

      <DmsFieldRow
        label="$page.settings.region.date_format_title"
        :description="
          t('page.settings.region.date_format_description', {
            auto: autoHints.dateFormat,
          })
        "
      >
        <DmsSaveStatus :state="states.dateFormat ?? 'idle'" />
        <DmsSegmented
          :items="dateFormatOptions"
          :model-value="choiceValue('dateFormat')"
          :aria-label="t('page.settings.region.date_format_title')"
          @update:model-value="saveChoice('dateFormat', $event)"
        />
      </DmsFieldRow>
    </DmsSection>

    <DmsSection
      title="$page.settings.region.preview_title"
      :description="
        t('page.settings.region.preview_description', {
          zone: timeZoneLabel(timeZone),
        })
      "
    >
      <div class="grid grid-cols-5 bg-(--dms-bg-muted) max-md:grid-cols-2">
        <div
          v-for="sample in samples"
          :key="sample.labelKey"
          class="border-muted min-w-0 border-s px-[18px] py-3 first:border-s-0 max-md:border-t max-md:nth-[-n+2]:border-t-0 max-md:nth-[odd]:border-s-0"
        >
          <DmsEyebrow
            as="span"
            size="xs"
            class="mb-1 block"
            :label="t(sample.labelKey)"
          />
          <b
            class="text-highlighted font-mono text-[13px] font-semibold whitespace-nowrap"
          >
            {{ sample.value }}
          </b>
        </div>
      </div>
    </DmsSection>
  </div>
</template>
