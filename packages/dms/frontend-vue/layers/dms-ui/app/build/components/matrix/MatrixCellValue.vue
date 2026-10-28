<script setup lang="ts">
import { computed, type VNodeChild } from "vue";
import striptags from "striptags";
import { resolveDmsComponent } from "../../../composables/resolveDmsComponent";
import { useColumnValueRenderer } from "../../composables/data-types/useColumnValueRenderer";
import { useComposedText } from "#dms-core/app/composables/translation/useComposedText";
import type {
  MatrixCellKind,
  MatrixCellState,
  MatrixColumn,
  MatrixRow,
  MatrixSelectOption,
} from "../../../types/matrix";
import {
  isEmptyValue,
  isStructuredValue,
  kindOf,
  structuredSizeTag,
  valueText,
} from "../../composables/matrix/matrixValues";
import { matrixRenderColumn } from "../../composables/matrix/matrixRender";

/**
 * A cell's value as read: by its column's kind (a right-aligned figure, a
 * switch's state, a date through the DMS date type, pills for a select or
 * tags, `{3}` and one line of JSON for an object, a clamped long text),
 * through the column's table view `display` (which reads the column's
 * options as its type's, so a status pill shows their labels), or a
 * module's own `component`.
 */
interface MatrixCellValueProps {
  column: MatrixColumn;
  value: unknown;
  row: MatrixRow;
  state?: MatrixCellState;
}

const props = withDefaults(defineProps<MatrixCellValueProps>(), {
  state: () => ({}),
});

const { t, locale } = useI18n();
const { processText } = useComposedText();
const { renderValue } = useColumnValueRenderer();

/** Draws a VNode a renderer returned. */
const RenderedValue = (renderProps: { node: VNodeChild }) => renderProps.node;
RenderedValue.props = ["node"];

const kind = computed<MatrixCellKind>(() => kindOf(props.column));
const isEmpty = computed(() => isEmptyValue(props.value));
const custom = computed(() =>
  props.column.component
    ? resolveDmsComponent(props.column.component)
    : undefined,
);
const renderColumn = computed(() =>
  matrixRenderColumn(props.column, processText),
);
const displayed = computed<VNodeChild | null>(() =>
  props.column.display || kind.value === "date"
    ? renderValue(renderColumn.value, props.value, props.row.values, "cell")
    : null,
);

const optionOf = (value: unknown): MatrixSelectOption | undefined =>
  props.column.options?.find((option) => option.value === value);

/** A select's value, or each tag, as a pill in its option's tone. */
const pills = computed(() => {
  const values = Array.isArray(props.value) ? props.value : [props.value];
  return values
    .filter((value) => !isEmptyValue(value))
    .map((value) => {
      const option = optionOf(value);
      return {
        key: String(value),
        label: option ? processText(option.label) : valueText(value),
        tone: option?.tone ?? "neutral",
        icon: option?.icon,
      };
    });
});

const DATETIME_FORMAT: Intl.DateTimeFormatOptions = {
  dateStyle: "medium",
  timeStyle: "short",
};

const numberText = computed(() =>
  typeof props.value === "number"
    ? new Intl.NumberFormat(locale.value).format(props.value)
    : valueText(props.value),
);
const dateTimeText = computed(() => {
  const date = new Date(String(props.value));
  return Number.isNaN(date.getTime())
    ? valueText(props.value)
    : new Intl.DateTimeFormat(locale.value, DATETIME_FORMAT).format(date);
});
const plainText = computed(() =>
  kind.value === "richText"
    ? striptags(String(props.value ?? ""))
    : valueText(props.value),
);
const sizeTag = computed(() =>
  isStructuredValue(props.value) ? structuredSizeTag(props.value) : "",
);
const placeholder = computed(() =>
  props.state.placeholder ? processText(props.state.placeholder) : "",
);

const PILL_KINDS = new Set<MatrixCellKind>(["select", "tags"]);
const CLAMPED_KINDS = new Set<MatrixCellKind>(["longText", "richText"]);
const MONO_KINDS = new Set<MatrixCellKind>(["code"]);
</script>

<template>
  <Component
    :is="custom"
    v-if="custom"
    :value="props.value"
    :row="props.row"
    :column="props.column"
    :cell="props.state"
  />
  <span
    v-else-if="isEmpty && kind !== 'boolean'"
    class="text-dimmed truncate italic"
  >
    {{ placeholder }}
  </span>
  <RenderedValue v-else-if="displayed !== null" :node="displayed" />
  <span
    v-else-if="kind === 'number'"
    class="text-highlighted font-mono tabular-nums"
  >
    {{ numberText }}
  </span>
  <UIcon
    v-else-if="kind === 'boolean'"
    :name="props.value ? 'i-ph-check-circle-fill' : 'i-ph-circle'"
    class="size-4 shrink-0"
    :class="props.value ? 'text-success' : 'text-dimmed'"
    :aria-label="props.value ? t('dms.matrix.yes') : t('dms.matrix.no')"
  />
  <span
    v-else-if="kind === 'datetime'"
    class="text-muted font-mono text-xs tabular-nums"
  >
    {{ dateTimeText }}
  </span>
  <span
    v-else-if="PILL_KINDS.has(kind)"
    class="flex min-w-0 items-center gap-1 overflow-hidden"
  >
    <DmsStatusPill
      v-for="pill in pills"
      :key="pill.key"
      :label="pill.label"
      :tone="pill.tone"
      :icon="pill.icon"
      dot="none"
      size="sm"
      :mono="false"
      class="shrink-0"
    />
  </span>
  <span
    v-else-if="sizeTag"
    class="flex min-w-0 items-center gap-1.5 overflow-hidden"
  >
    <span
      class="bg-elevated text-muted shrink-0 rounded px-1 font-mono text-[10px]"
    >
      {{ sizeTag }}
    </span>
    <span class="text-muted truncate font-mono text-xs">{{ plainText }}</span>
  </span>
  <span
    v-else-if="CLAMPED_KINDS.has(kind)"
    class="line-clamp-2 text-[12.5px]/4 [overflow-wrap:anywhere] whitespace-normal"
    :title="plainText"
  >
    {{ plainText }}
  </span>
  <span
    v-else
    class="truncate"
    :class="MONO_KINDS.has(kind) && 'font-mono text-xs'"
    :title="plainText"
  >
    {{ plainText }}
  </span>
</template>
