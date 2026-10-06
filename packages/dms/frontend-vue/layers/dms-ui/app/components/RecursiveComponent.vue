<script setup lang="ts">
import { usePermissionPreview } from "#dms-core/app/build/composables/auth/usePermissionPreview";
import { childLayoutPath } from "#dms-core/app/build/utils/permission-preview";
import {
  GRID_DECLARED_COLUMNS,
  type GridDeclaredColumns,
} from "./grid/constants";

interface Props {
  component: ResolvedComponentInfo;
  pageId: string;
  componentId: string;
  routeParams?: Record<string, string>;
  /**
   * Position in the page layout: the component key, then each child id. Lets
   * a role preview veil this block; without it the block is never veiled.
   */
  layoutPath?: string;
}

const props = defineProps<Props>();

const { t } = useI18n();
const preview = usePermissionPreview();
const previewBlock = computed(() => preview.blockFor(props.layoutPath));
const veilLabel = computed(() => {
  const block = previewBlock.value;
  if (!block) return "";
  if (block.state === "hidden") {
    return t("page.settings.roles.preview.veil_hidden", {
      role: preview.session.value?.roleName ?? "",
    });
  }
  return t(`page.settings.roles.preview.veil_${block.state}`);
});
const { processI18n } = useTranslation();
const veilDetail = computed(() => {
  const block = previewBlock.value;
  if (!block || block.state === "hidden") return undefined;
  return t("page.settings.roles.preview.veil_withheld", {
    actions: block.withheld.map((title) => processI18n(title)).join(", "),
  });
});

function calculateColumnCount(
  children: ResolvedComponentInfo[] | undefined,
): number {
  if (!children) return 0;
  return children.reduce(
    (sum, child) => sum + ((child.colSpan as number) || 1),
    0,
  );
}

function getColSpanStyle(
  child: ResolvedComponentInfo,
): Record<string, string> | undefined {
  const colSpan = Number(child.colSpan);
  if (!colSpan || colSpan <= 1) return undefined;
  // Never more tracks than the grid has left at its current width (a phone
  // keeps one): a wider span would add implicit columns past the screen.
  // `--dms-grid-tracks` comes from the enclosing Grid / GridRow.
  return {
    gridColumn: `span min(${colSpan}, var(--dms-grid-tracks, ${colSpan}))`,
  };
}

const columnCount = computed(() =>
  calculateColumnCount(props.component.children),
);

// A Grid drawn here lines its rows up on the widest of them: declared from
// the layout, so it is known before any row sets up (see GridDeclaredColumns).
provide<GridDeclaredColumns>(GRID_DECLARED_COLUMNS, {
  componentId: props.componentId,
  columns: computed(() =>
    Math.max(
      0,
      ...(props.component.children ?? []).map((row) =>
        calculateColumnCount(row.children),
      ),
    ),
  ),
});
</script>

<template>
  <!-- Persistent while a preview runs: its answers move the veils under live
       blocks (a table view has an async setup), which must not remount. -->
  <DmsPermissionVeil
    :state="previewBlock?.state"
    :label="veilLabel"
    :detail="veilDetail"
    :persistent="preview.isActive.value"
  >
    <Component
      :is="component.component"
      v-bind="JSON.parse(JSON.stringify(component.options || {})) || {}"
      :page-id="pageId"
      :component-id="componentId"
      :child-count="columnCount"
      :route-params="routeParams"
    >
      <template
        v-for="(child, childIndex) in component.children?.filter((c) => c.slot)"
        :key="`${componentId}-slot-${childIndex}`"
        #[child.slot]
      >
        <div v-if="getColSpanStyle(child)" :style="getColSpanStyle(child)">
          <DmsRecursiveComponent
            :component="child"
            :page-id="pageId"
            :component-id="`${componentId}-child-${child.id}`"
            :route-params="routeParams"
            :layout-path="childLayoutPath(layoutPath, child.id)"
          />
        </div>
        <DmsRecursiveComponent
          v-else
          :component="child"
          :page-id="pageId"
          :component-id="`${componentId}-child-${child.id}`"
          :route-params="routeParams"
          :layout-path="childLayoutPath(layoutPath, child.id)"
        />
      </template>
      <template
        v-for="(child, childIndex) in component.children?.filter(
          (c) => !c.slot,
        )"
        :key="`${componentId}-child-${childIndex}`"
      >
        <div v-if="getColSpanStyle(child)" :style="getColSpanStyle(child)">
          <DmsRecursiveComponent
            :component="child"
            :page-id="pageId"
            :component-id="`${componentId}-child-${child.id}`"
            :route-params="routeParams"
            :layout-path="childLayoutPath(layoutPath, child.id)"
          />
        </div>
        <DmsRecursiveComponent
          v-else
          :component="child"
          :page-id="pageId"
          :component-id="`${componentId}-child-${child.id}`"
          :route-params="routeParams"
          :layout-path="childLayoutPath(layoutPath, child.id)"
        />
      </template>
    </Component>
  </DmsPermissionVeil>
</template>
