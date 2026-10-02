<script setup lang="ts">
import { tv } from "tailwind-variants";
import {
  highlightSegments,
  type PermissionChange,
  type SelectionCount,
  type SelectionState,
} from "./role-permissions";
import type { RolePermissionNode } from "./role-types";

interface RolePermissionLeafProps {
  node: RolePermissionNode;
  state: SelectionState;
  change: PermissionChange;
  /** Labels of the permissions this one requires. */
  requires: string[];
  /** Hint about what granting this permission added on its own. */
  autoAddedHint?: string;
  disabled?: boolean;
  disabledHint?: string;
  query?: string;
  /**
   * Keeps a caret column before the checkbox, so the row lines up with
   * collapsible siblings in the nested tree.
   */
  gutter?: boolean;
  /** Whether the row opens on its children: a collapsible row of the tree. */
  expandable?: boolean;
  expanded?: boolean;
  /** Id of the element holding the children, for `aria-controls`. */
  controls?: string;
  /** Selected permissions of the subtree, shown by a collapsible row. */
  count?: SelectionCount;
}

const props = withDefaults(defineProps<RolePermissionLeafProps>(), {
  autoAddedHint: undefined,
  disabled: false,
  disabledHint: undefined,
  query: "",
  gutter: false,
  expandable: false,
  expanded: false,
  controls: undefined,
  count: undefined,
});

const emit = defineEmits<{
  toggle: [checked: boolean];
  "toggle-expanded": [];
}>();
const { t } = useI18n();
const { processI18n } = useTranslation();

// v2 .cs-pleaf: checkbox, name with its hints and description, and the
// permission id revealed on hover; a changed row is tinted until saved.
const theme = tv({
  slots: {
    root: "group grid min-h-[42px] cursor-pointer items-center gap-2.5 rounded-[7px] px-2 py-[5px] hover:bg-elevated",
    name: "flex flex-wrap items-center gap-2 text-[13px] text-default",
    description: "mt-px text-xs text-muted",
    id: "font-mono text-[10.5px] font-medium text-dimmed opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 max-sm:hidden",
    count:
      "flex shrink-0 items-center gap-2 font-mono text-[11px] font-semibold text-dimmed",
    chip: "inline-flex h-[18px] items-center gap-1 rounded px-1.5 font-mono text-[10.5px] font-medium whitespace-nowrap",
  },
  variants: {
    gutter: {
      true: { root: "grid-cols-[20px_20px_minmax(0,1fr)_auto]" },
      false: { root: "grid-cols-[20px_minmax(0,1fr)_auto]" },
    },
    expandable: { true: { name: "font-[550]" } },
    isFull: { true: { count: "text-primary" } },
    isOn: { true: { name: "font-[550] text-highlighted" } },
    isChanged: { true: { root: "bg-warning/6 hover:bg-warning/10" } },
    disabled: { true: { root: "cursor-not-allowed", name: "opacity-50" } },
  },
});

const ui = computed(() =>
  theme({
    gutter: props.gutter || props.expandable,
    expandable: props.expandable,
    isFull:
      props.count !== undefined &&
      props.count.selected > 0 &&
      props.count.selected === props.count.total,
    isOn: props.state !== false,
    isChanged: props.change !== null,
    disabled: props.disabled,
  }),
);

const label = computed(() => processI18n(props.node.label));
const segments = computed(() => highlightSegments(label.value, props.query));

const CHANGE_CLASSES: Record<"added" | "removed", string> = {
  added: "text-warning",
  removed: "text-error",
};

function toggle(): void {
  if (props.disabled) return;
  emit("toggle", props.state !== true);
}

// A collapsible row opens on a click; its checkbox grants or revokes.
function onRowClick(): void {
  if (props.expandable) emit("toggle-expanded");
  else toggle();
}
</script>

<template>
  <div
    :class="ui.root()"
    :title="props.disabled ? props.disabledHint : undefined"
    :data-permission-id="props.node.id"
    @click="onRowClick"
  >
    <UButton
      v-if="props.expandable"
      :icon="props.expanded ? 'i-ph-caret-down' : 'i-ph-caret-right'"
      color="neutral"
      variant="link"
      size="xs"
      class="text-muted p-0"
      :aria-label="
        props.expanded
          ? t('page.settings.roles.editor.collapse')
          : t('page.settings.roles.editor.expand')
      "
      :aria-expanded="props.expanded"
      :aria-controls="props.controls"
      @click.stop="emit('toggle-expanded')"
    />
    <span v-else-if="props.gutter" />
    <span class="flex" @click.stop>
      <UCheckbox
        :model-value="props.state"
        :disabled="props.disabled"
        :aria-label="label"
        @update:model-value="toggle"
      />
    </span>
    <div class="min-w-0">
      <div :class="ui.name()">
        <span>
          <template v-for="(segment, position) in segments" :key="position">
            <mark
              v-if="segment.isMatch"
              class="text-highlighted rounded-[3px] bg-(--dms-accent-tint-strong) px-px"
            >
              {{ segment.text }}
            </mark>
            <template v-else>{{ segment.text }}</template>
          </template>
        </span>
        <span
          v-if="props.change"
          :class="[
            'inline-flex items-center gap-1 font-mono text-[10px] font-semibold tracking-[0.06em] uppercase before:size-1.5 before:rounded-full before:bg-current',
            CHANGE_CLASSES[props.change],
          ]"
        >
          {{ t(`page.settings.roles.editor.change_${props.change}`) }}
        </span>
        <span
          v-for="required in props.requires"
          :key="required"
          :class="[ui.chip(), 'bg-elevated text-muted']"
        >
          <UIcon name="i-ph-link-simple" class="size-[11px]" />
          {{ t("page.settings.roles.editor.requires", { name: required }) }}
        </span>
        <span
          v-if="props.autoAddedHint"
          :class="[ui.chip(), 'text-primary bg-(--dms-accent-tint)']"
        >
          <UIcon name="i-ph-check" class="size-[11px]" />
          {{ props.autoAddedHint }}
        </span>
      </div>
      <div v-if="props.node.description" :class="ui.description()">
        {{ processI18n(props.node.description) }}
      </div>
    </div>
    <span class="flex min-w-0 items-center gap-3">
      <span :class="ui.id()">{{ props.node.id }}</span>
      <span v-if="props.count" :class="ui.count()">
        <DmsMeter
          as="span"
          size="xs"
          class="w-10 shrink-0"
          :value="props.count.selected"
          :max="props.count.total"
        />
        {{ props.count.selected }}/{{ props.count.total }}
      </span>
    </span>
  </div>
</template>
