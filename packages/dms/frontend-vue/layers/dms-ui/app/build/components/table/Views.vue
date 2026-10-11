<script setup lang="ts">
import { EYEBROW_CLASS } from "../../utils/eyebrow";
import { tv } from "tailwind-variants";
import type { DmsAppConfig } from "#dms-core/shared/types/app-config";
import type { TableViewViewsLayout } from "../../../composables/table-view/types";
import { toneTextClass } from "../../utils/tone";
import TableTabs, { type TableTabItem } from "./Tabs.vue";

/** A view as the strip draws it: its counter already read. */
export interface TableViewItem {
  id: string;
  label: string;
  icon?: string;
  tone?: string;
  dot?: string;
  count?: number;
  countPending?: boolean;
  /** Saved by the user: it can be saved over and deleted. */
  isUserView?: boolean;
}

interface Props {
  items: TableViewItem[];
  activeId?: string;
  layout: TableViewViewsLayout;
  /** The table moved away from the open view. */
  modified?: boolean;
  /** Users may save the current state as a view of their own. */
  canSaveAs?: boolean;
  /** No tab row follows the strip: it draws the rule above the rows. */
  divided?: boolean;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  open: [id: string];
  reset: [];
  save: [];
  saveAs: [];
  delete: [id: string];
}>();

// v2 saved views (saas workspaces): eyebrow, outline pills, the open one on
// the accent tint, a dashed "+ Save current view" at the end.
const theme = tv({
  slots: {
    strip:
      "no-scrollbar flex items-center gap-1.5 overflow-x-auto pe-3.5 pb-3 ps-[18px]",
    eyebrow: `${EYEBROW_CLASS} me-1 shrink-0 text-dimmed`,
    pill: "inline-flex h-[26px] shrink-0 items-center gap-1.5 rounded-full border border-default px-2.5 text-xs font-medium whitespace-nowrap text-muted transition-colors hover:bg-elevated hover:text-highlighted [&>svg]:size-[13px]",
    pillCount: "font-mono text-[10.5px] tabular-nums",
    pillAdd: "border-dashed",
    dot: "size-1.5 shrink-0 rounded-full bg-current",
    modifiedDot: "size-1.5 shrink-0 rounded-full bg-warning",
    actions: "ms-auto flex shrink-0 items-center gap-1",
    tabsRow: "flex items-center border-b border-default pe-3.5",
    menuValue: "max-w-48 truncate",
  },
  variants: {
    divided: {
      true: { strip: "border-b border-default" },
    },
    active: {
      true: {
        pill: "border-(--dms-accent-line) bg-(--dms-accent-tint) text-highlighted hover:bg-(--dms-accent-tint)",
      },
    },
  },
});

const appConfig = useDmsAppConfig() as DmsAppConfig & {
  ui: { tableViews: Partial<typeof theme> };
};
const uiVariant = tv({
  extend: tv(theme),
  ...(appConfig.ui?.tableViews || {}),
});
const ui = computed(() => uiVariant({ divided: props.divided }));

const { t, locale } = useI18n();
const countFormat = computed(() => new Intl.NumberFormat(locale.value));

const activeView = computed(() =>
  props.items.find((view) => view.id === props.activeId),
);
const canSave = computed(
  () => !!props.modified && !!activeView.value?.isUserView,
);
const canDelete = computed(() => !!activeView.value?.isUserView);

const tabItems = computed<TableTabItem[]>(() =>
  props.items.map((view) => ({
    id: view.id,
    label: view.label,
    icon: view.icon,
    tone: view.tone,
    dot: view.dot,
    count: view.count,
    countPending: view.countPending,
    modified: !!props.modified && view.id === props.activeId,
  })),
);

/** What can be done with the open view. */
interface ViewAction {
  id: "reset" | "save" | "saveAs" | "delete";
  label: string;
  icon: string;
  /** Drawn as an icon alone outside the menu. */
  iconOnly?: boolean;
  color?: "error";
  run: () => void;
}

const viewActions = computed<ViewAction[]>(() => {
  const actions: ViewAction[] = [];
  if (props.modified) {
    actions.push({
      id: "reset",
      label: t("dms.table.views.reset"),
      icon: "i-ph-arrow-counter-clockwise",
      run: () => emit("reset"),
    });
  }
  if (canSave.value) {
    actions.push({
      id: "save",
      label: t("dms.table.views.save"),
      icon: "i-ph-floppy-disk",
      run: () => emit("save"),
    });
  }
  if (props.canSaveAs) {
    actions.push({
      id: "saveAs",
      label: t("dms.table.views.save_as"),
      icon: "i-ph-plus",
      run: () => emit("saveAs"),
    });
  }
  if (canDelete.value && props.activeId) {
    const id = props.activeId;
    actions.push({
      id: "delete",
      label: t("dms.table.views.delete"),
      icon: "i-ph-trash",
      iconOnly: true,
      color: "error",
      run: () => emit("delete", id),
    });
  }
  return actions;
});

// The strip ends with its own "+ Save current view" pill.
const barActions = computed(() =>
  props.layout === "strip"
    ? viewActions.value.filter((action) => action.id !== "saveAs")
    : viewActions.value,
);

// A menu group left empty would draw a stray separator.
const menuItems = computed(() =>
  [
    props.items.map((view) => ({
      label: view.label,
      icon: view.icon,
      type: "checkbox" as const,
      checked: view.id === props.activeId,
      onSelect: () => emit("open", view.id),
    })),
    viewActions.value.map((action) => ({
      label: action.label,
      icon: action.icon,
      color: action.color,
      onSelect: action.run,
    })),
  ].filter((group) => group.length > 0),
);

const openTab = (id: string) => emit("open", id);
</script>

<template>
  <UDropdownMenu
    v-if="layout === 'menu'"
    :items="menuItems"
    :content="{ align: 'start' }"
    :ui="{ content: 'min-w-56' }"
  >
    <UButton
      size="sm"
      color="neutral"
      variant="outline"
      icon="i-ph-bookmarks-simple"
      :trailing-icon="appConfig.ui.icons.chevronDown"
      :aria-label="t('dms.table.views.title')"
    >
      <span :class="ui.menuValue()">
        {{ activeView?.label ?? t("dms.table.views.title") }}
      </span>
      <span
        v-if="modified"
        :title="t('dms.table.views.modified')"
        :class="ui.modifiedDot()"
      />
    </UButton>
  </UDropdownMenu>

  <div
    v-else
    :role="layout === 'strip' ? 'toolbar' : undefined"
    :aria-label="layout === 'strip' ? t('dms.table.views.title') : undefined"
    :class="layout === 'tabs' ? ui.tabsRow() : ui.strip()"
  >
    <TableTabs
      v-if="layout === 'tabs'"
      :model-value="activeId ?? ''"
      :tabs="tabItems"
      :label="t('dms.table.views.title')"
      class="me-auto min-w-0 border-b-0"
      @update:model-value="openTab"
    />
    <template v-else>
      <span :class="ui.eyebrow()">{{ t("dms.table.views.title") }}</span>
      <button
        v-for="view in items"
        :key="view.id"
        type="button"
        :aria-pressed="view.id === activeId"
        :class="ui.pill({ active: view.id === activeId })"
        @click="emit('open', view.id)"
      >
        <span
          v-if="view.dot"
          aria-hidden="true"
          :class="[ui.dot(), toneTextClass(view.dot)]"
        />
        <UIcon
          v-if="view.icon"
          :name="view.icon"
          :class="toneTextClass(view.tone) || 'text-dimmed'"
        />
        {{ view.label }}
        <USkeleton
          :aria-label="t('dms.a11y.loading')"
          v-if="view.countPending"
          aria-hidden="true"
          class="h-3 w-4 rounded-[3px]"
        />
        <span
          v-else-if="view.count !== undefined"
          :class="[ui.pillCount(), toneTextClass(view.tone)]"
        >
          {{ countFormat.format(view.count) }}
        </span>
        <span
          v-if="modified && view.id === activeId"
          :title="t('dms.table.views.modified')"
          :class="ui.modifiedDot()"
        />
      </button>
      <button
        v-if="canSaveAs"
        type="button"
        :class="[ui.pill(), ui.pillAdd()]"
        @click="emit('saveAs')"
      >
        <UIcon name="i-ph-plus" />
        {{ t("dms.table.views.save_current") }}
      </button>
    </template>
    <div v-if="barActions.length > 0" :class="ui.actions()">
      <UButton
        v-for="action in barActions"
        :key="action.id"
        size="xs"
        color="neutral"
        variant="ghost"
        :icon="action.icon"
        :label="action.iconOnly ? undefined : action.label"
        :aria-label="action.label"
        @click="action.run"
      />
    </div>
  </div>
</template>
