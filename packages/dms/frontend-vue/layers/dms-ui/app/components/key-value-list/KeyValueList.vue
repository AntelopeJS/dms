<script setup lang="ts">
import { computed } from "vue";
import { regionalDateTimeFormat } from "#dms-core/app/utils/regional";
import DmsStatusPill from "../status-pill/StatusPill.vue";
import DmsAutoLink from "../link/AutoLink.vue";
import { DMS_TONE_TEXT, canonicalTone } from "../../build/utils/tone";
import type { Tone } from "../../types/tone";

/**
 * How a value is drawn: `text` plain, `status` a tinted pill, `money` a
 * currency amount, `date` a localized date, `link` an accent link, `mono` an
 * identifier or a figure in the mono font.
 */
export type KeyValueType =
  | "text"
  | "status"
  | "money"
  | "date"
  | "link"
  | "mono";

export interface KeyValueItem {
  /** Stable key; the position is used without one. */
  id?: string;
  label: string;
  /** Raw value; `null`/`undefined` renders as an em dash. */
  value?: string | number | null;
  type?: KeyValueType;
  /** Route, `#anchor` or URL the value links to (any type). */
  to?: string;
  /** Text color (text, mono, money, date) or pill tone (status). */
  tone?: Tone;
  /** Dim note after the value ("Authenticator app"). */
  detail?: string;
  /** ISO 4217 code of a `money` value; overrides the list's `currency`. */
  currency?: string;
  /** This value alone is still loading: a skeleton stands in for it. */
  loading?: boolean;
}

interface KeyValueListProps {
  items?: KeyValueItem[];
  /** Tighter rows (32px instead of 38px) for side panels. */
  dense?: boolean;
  /** Columns on wide screens (1–3); one on phones. */
  columns?: number;
  /** Loading: values turn to skeletons, or `skeletonCount` rows are drawn. */
  loading?: boolean;
  skeletonCount?: number;
  /** Default ISO 4217 code of `money` values. */
  currency?: string;
}

interface KeyValueListSlots {
  /** Replaces a value cell; receives the item and its formatted text. */
  value?: (props: { item: KeyValueItem; formatted: string }) => unknown;
}

const props = withDefaults(defineProps<KeyValueListProps>(), {
  items: () => [],
  dense: false,
  columns: 1,
  loading: false,
  skeletonCount: 3,
  currency: "EUR",
});
const slots = defineSlots<KeyValueListSlots>();

const EMPTY_VALUE = "—";
const MAX_COLUMNS = 3;

// v2 .c-dl: label left, value right, rows split by a muted hairline. Each
// column's first row drops its line, at every breakpoint.
const COLUMN_CLASSES: Record<number, string> = {
  1: "[&>div:first-child]:border-t-0",
  2: "gap-x-8 sm:grid-cols-2 [&>div:first-child]:border-t-0 sm:[&>div:nth-child(2)]:border-t-0",
  3: "gap-x-8 sm:grid-cols-2 lg:grid-cols-3 [&>div:first-child]:border-t-0 sm:[&>div:nth-child(2)]:border-t-0 lg:[&>div:nth-child(3)]:border-t-0",
};

const { locale } = useI18n();

const columnClass = computed(
  () =>
    COLUMN_CLASSES[
      Math.min(MAX_COLUMNS, Math.max(1, Math.round(props.columns)))
    ],
);
// The row wraps: a value too long to sit beside its label (a phone, a narrow
// column) drops under it, still right-aligned, instead of being cut.
const rowClass = computed(() => [
  "border-muted flex flex-wrap items-center gap-x-3 gap-y-0.5 border-t",
  props.dense ? "min-h-8 py-1" : "min-h-[38px] py-1.5",
]);
const showPlaceholders = computed(
  () => props.loading && props.items.length === 0,
);

type ValueFormatter = (item: KeyValueItem, value: string | number) => string;

function formatNumber(_item: KeyValueItem, value: string | number): string {
  if (typeof value !== "number") return value;
  return new Intl.NumberFormat(locale.value).format(value);
}

function formatMoney(item: KeyValueItem, value: string | number): string {
  if (typeof value !== "number") return value;
  try {
    return new Intl.NumberFormat(locale.value, {
      style: "currency",
      currency: item.currency ?? props.currency,
    }).format(value);
  } catch {
    // An unknown currency code: the amount is still worth showing.
    return formatNumber(item, value);
  }
}

function formatDate(_item: KeyValueItem, value: string | number): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return regionalDateTimeFormat(locale.value, { dateStyle: "medium" }).format(
    date,
  );
}

const FORMATTERS: Partial<Record<KeyValueType, ValueFormatter>> = {
  money: formatMoney,
  date: formatDate,
};

// Text styles per type; the tone colours every type but a link.
const TYPE_CLASSES: Partial<Record<KeyValueType, string>> = {
  link: "text-primary font-[550]",
  mono: "font-mono text-[12.5px] tabular-nums",
  money: "tabular-nums",
};

function format(item: KeyValueItem): string {
  if (item.value === null || item.value === undefined || item.value === "") {
    return EMPTY_VALUE;
  }
  const formatter = FORMATTERS[item.type ?? "text"] ?? formatNumber;
  return formatter(item, item.value);
}

function valueClass(item: KeyValueItem): string[] {
  const type = item.type ?? "text";
  const color =
    type === "link"
      ? ""
      : item.tone
        ? DMS_TONE_TEXT[canonicalTone(item.tone)]
        : "text-highlighted";
  // A value longer than the whole row (an id, a long name) wraps rather than
  // hiding its end: there is no hover on a phone to reveal it.
  return ["wrap-anywhere", color, TYPE_CLASSES[type] ?? ""];
}

function keyOf(item: KeyValueItem, index: number): string {
  return item.id ?? `${index}-${item.label}`;
}
</script>

<template>
  <!-- grid-cols-1: minmax(0, 1fr) tracks, so a long value truncates instead
       of widening the list past a narrow screen. -->
  <dl
    class="grid grid-cols-1"
    :class="[columnClass, props.dense ? 'text-[12.5px]' : 'text-[13px]']"
    :aria-busy="props.loading || undefined"
  >
    <template v-if="showPlaceholders">
      <div v-for="index in props.skeletonCount" :key="index" :class="rowClass">
        <dt class="min-w-[120px] flex-none">
          <USkeleton class="h-3 w-20" />
        </dt>
        <dd class="ms-auto">
          <USkeleton class="h-3 w-24" />
        </dd>
      </div>
    </template>
    <template v-else>
      <div
        v-for="(item, index) in props.items"
        :key="keyOf(item, index)"
        :class="rowClass"
      >
        <dt class="text-muted min-w-[120px] flex-none">{{ item.label }}</dt>
        <dd
          class="ms-auto flex min-w-0 flex-wrap items-center justify-end gap-x-1.5 gap-y-0.5 text-end"
        >
          <USkeleton v-if="props.loading || item.loading" class="h-3 w-24" />
          <slot
            v-else-if="slots.value"
            name="value"
            :item="item"
            :formatted="format(item)"
          />
          <template v-else>
            <component
              :is="item.to ? DmsAutoLink : 'span'"
              :to="item.to"
              class="min-w-0"
              :class="item.to && item.type !== 'status' && 'hover:underline'"
            >
              <DmsStatusPill
                v-if="item.type === 'status'"
                :tone="item.tone ?? 'neutral'"
                :label="format(item)"
              />
              <span v-else class="block" :class="valueClass(item)">
                {{ format(item) }}
              </span>
            </component>
            <span v-if="item.detail" class="text-dimmed truncate text-xs">
              {{ item.detail }}
            </span>
          </template>
        </dd>
      </div>
    </template>
  </dl>
</template>
