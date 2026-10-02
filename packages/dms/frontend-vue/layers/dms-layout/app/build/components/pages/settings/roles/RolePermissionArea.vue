<script setup lang="ts">
import { tv } from "tailwind-variants";
import {
  childrenElementId,
  type PermissionArea,
  type SelectionCount,
  type SelectionState,
} from "./role-permissions";

interface RolePermissionAreaProps {
  area: PermissionArea;
  count: SelectionCount;
  /** State of the heading's checkbox (see `checkboxState`). */
  state: SelectionState;
  isExpanded: boolean;
  disabled: boolean;
}

const props = defineProps<RolePermissionAreaProps>();
const emit = defineEmits<{
  toggle: [checked: boolean];
  "toggle-expanded": [];
}>();

const { t } = useI18n();
const { processI18n } = useTranslation();

const FALLBACK_ICON = "i-ph-squares-four";

const hasRows = computed(() => (props.area.node.children?.length ?? 0) > 0);
const childrenId = computed(() => childrenElementId(props.area.node.id));
const subtitle = computed(() =>
  processI18n(props.area.node.description ?? props.area.section ?? ""),
);

// v2 .cs-parea: caret, tri-state box, icon tile, title over its subtitle and
// the "n/m" count with its bar; the count turns accent when complete. The
// row reads the editor's width (@container/editor): the hover id goes under
// 576px, and under 448px (phones) the icon tile and the bar go too and the
// title wraps, which otherwise kept three letters of it.
const theme = tv({
  slots: {
    root: "group mt-1 grid min-h-[46px] grid-cols-[20px_20px_30px_minmax(0,1fr)_auto] items-center gap-2 rounded-lg px-2.5 py-1.5 hover:bg-elevated @max-md/editor:grid-cols-[20px_20px_minmax(0,1fr)_auto]",
    count:
      "flex items-center gap-2 font-mono text-[11.5px] font-semibold text-muted",
  },
  variants: {
    completion: {
      full: { count: "text-primary" },
      none: { count: "text-dimmed" },
      partial: {},
    },
  },
});

const completion = computed(() => {
  if (props.count.selected === 0) return "none";
  return props.count.selected === props.count.total ? "full" : "partial";
});
const ui = computed(() => theme({ completion: completion.value }));
</script>

<template>
  <div role="treeitem" :aria-expanded="hasRows ? props.isExpanded : undefined">
    <div :class="ui.root()" :data-permission-id="props.area.node.id">
      <UButton
        v-if="hasRows"
        :icon="props.isExpanded ? 'i-ph-caret-down' : 'i-ph-caret-right'"
        color="neutral"
        variant="link"
        size="xs"
        class="text-muted p-0"
        :aria-label="
          props.isExpanded
            ? t('page.settings.roles.editor.collapse')
            : t('page.settings.roles.editor.expand')
        "
        :aria-expanded="props.isExpanded"
        :aria-controls="childrenId"
        @click="emit('toggle-expanded')"
      />
      <span v-else />
      <UCheckbox
        :model-value="props.state"
        :disabled="props.disabled"
        :aria-label="processI18n(props.area.node.label)"
        @update:model-value="emit('toggle', props.state !== true)"
      />
      <span
        class="border-default text-muted grid size-7 place-items-center rounded-[7px] border bg-(--dms-bg-muted) @max-md/editor:hidden"
      >
        <UIcon
          :name="props.area.node.icon ?? FALLBACK_ICON"
          class="size-[15px]"
        />
      </span>
      <button
        type="button"
        class="min-w-0 cursor-pointer text-start"
        :disabled="!hasRows"
        @click="emit('toggle-expanded')"
      >
        <b
          class="text-highlighted block truncate text-[13px] font-[650] @max-md/editor:whitespace-normal"
        >
          {{ processI18n(props.area.node.label) }}
        </b>
        <small
          v-if="subtitle"
          class="text-muted block truncate text-xs @max-md/editor:whitespace-normal"
        >
          {{ subtitle }}
        </small>
      </button>
      <span :class="ui.count()">
        <span
          class="text-dimmed max-w-40 min-w-0 truncate font-medium opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 @max-xl/editor:hidden"
          :title="props.area.node.id"
        >
          {{ props.area.node.id }}
        </span>
        <DmsMeter
          as="span"
          size="xs"
          class="w-14 shrink-0 @max-md/editor:hidden"
          :value="props.count.selected"
          :max="props.count.total"
        />
        {{ props.count.selected }}/{{ props.count.total }}
      </span>
    </div>
    <div
      v-if="props.isExpanded && hasRows"
      :id="childrenId"
      role="group"
      class="border-default ms-[19px] mt-0.5 mb-1.5 border-s ps-1.5 @max-md/editor:ms-[9px] @max-md/editor:ps-0.5"
    >
      <slot />
    </div>
  </div>
</template>
