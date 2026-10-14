<script setup lang="ts">
interface Props {
  scopeId: string;
  title: string;
  compareLabel: string;
}

const props = defineProps<Props>();

const MONTH_COUNT = 3;
const LAST_DAY_OF_PREVIOUS_MONTH = 0;

interface BillingMonth {
  label: string;
  value: string;
  range: PeriodRange;
}

const { locale } = useI18n();

// In the reader's calendar, as a PeriodSelector resolves its presets: a
// server render then computes the months the browser will, in its zone.
function billingMonthRange(monthsAgo: number): PeriodRange {
  const clock = readerClock();
  const { year, month } = clock.wall(new Date());
  const from = clock.instant({
    year,
    month: month - monthsAgo,
    day: 1,
    hours: 0,
    minutes: 0,
    seconds: 0,
    milliseconds: 0,
  });
  const to = clock.instant({
    year,
    month: month - monthsAgo + 1,
    day: LAST_DAY_OF_PREVIOUS_MONTH,
    hours: END_OF_DAY_HOURS,
    minutes: END_OF_DAY_MINUTES,
    seconds: END_OF_DAY_SECONDS,
    milliseconds: END_OF_DAY_MS,
  });
  return { from, to };
}

const months = computed<BillingMonth[]>(() => {
  const formatter = regionalDateTimeFormat(
    locale.value,
    { month: "long", year: "numeric" },
    { keepLocalZone: true },
  );
  return Array.from({ length: MONTH_COUNT }, (_, monthsAgo) => {
    const range = billingMonthRange(monthsAgo);
    return {
      label: formatter.format(range.from),
      value: String(monthsAgo),
      range,
    };
  });
});

const period = usePeriod();
const cleanup = registerPeriodScope(props.scopeId, period.state);
onBeforeUnmount(cleanup);

const selectedMonth = ref(months.value[0]?.value ?? "0");
const isComparing = ref(true);

watch(
  [selectedMonth, months],
  ([value, available]) => {
    const month = available.find((entry) => entry.value === value);
    if (month) period.setCustomRange(month.range);
  },
  { immediate: true },
);

watch(
  isComparing,
  (enabled) => period.setComparison(enabled ? "previous-period" : "none"),
  { immediate: true },
);
</script>

<template>
  <div class="dms-card flex flex-wrap items-center gap-4 p-4">
    <span class="text-xs font-medium tracking-wide text-muted uppercase">
      {{ title }}
    </span>
    <USelect
      v-model="selectedMonth"
      :items="months"
      value-key="value"
      label-key="label"
      size="sm"
      class="w-48"
    />
    <USwitch v-model="isComparing" :label="compareLabel" size="sm" />
  </div>
</template>
