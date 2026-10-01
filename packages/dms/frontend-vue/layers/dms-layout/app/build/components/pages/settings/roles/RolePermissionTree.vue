<script setup lang="ts">
import RolePermissionArea from "./RolePermissionArea.vue";
import RolePermissionBranch from "./RolePermissionBranch.vue";
import RolePermissionGroup from "./RolePermissionGroup.vue";
import RolePermissionLeaf from "./RolePermissionLeaf.vue";
import {
  checkboxState,
  countSelected,
  type PermissionArea,
  type PermissionChange,
  type PermissionIndex,
  type PermissionRowContext,
  type PermissionSearchHit,
  type SelectionState,
} from "./role-permissions";
import type { RolePermissionNode } from "./role-types";

interface RolePermissionTreeProps {
  areas: PermissionArea[];
  index: PermissionIndex;
  selection: Set<string>;
  saved: Set<string>;
  autoAdded: Map<string, string[]>;
  expanded: Set<string>;
  /** Hits of the current search; `null` when not searching. */
  hits: PermissionSearchHit[] | null;
  query: string;
  canGrant: (permissionId: string) => boolean;
  readonly: boolean;
}

const props = defineProps<RolePermissionTreeProps>();
const emit = defineEmits<{
  toggle: [id: string, checked: boolean];
  "toggle-area": [id: string];
}>();

const { t } = useI18n();
const { processI18n } = useTranslation();

function stateOf(node: RolePermissionNode): SelectionState {
  return checkboxState(props.index, node.id, props.selection);
}

function changeOf(id: string): PermissionChange {
  const isSelected = props.selection.has(id);
  if (isSelected === props.saved.has(id)) return null;
  return isSelected ? "added" : "removed";
}

function requiresOf(node: RolePermissionNode): string[] {
  return (node.dependencies ?? [])
    .map((id) => props.index.nodes.get(id)?.label)
    .filter((label): label is string => Boolean(label))
    .map((label) => processI18n(label));
}

function autoAddedHintOf(id: string): string | undefined {
  const added = props.autoAdded.get(id) ?? [];
  const [first] = added;
  if (!first) return undefined;
  if (added.length > 1) {
    return t("page.settings.roles.editor.auto_added_many", added.length);
  }
  const label = processI18n(props.index.nodes.get(first)?.label ?? first);
  return t("page.settings.roles.editor.auto_added", { name: label });
}

function isDisabled(node: RolePermissionNode): boolean {
  if (props.readonly) return true;
  return stateOf(node) === false && !props.canGrant(node.id);
}

function isNewHeading(position: number): boolean {
  const hits = props.hits ?? [];
  const heading = hits[position]?.heading;
  if (!heading) return false;
  return position === 0 || hits[position - 1]?.heading !== heading;
}

// Handed down the nested branches as one object instead of a dozen props.
const rowContext = computed<PermissionRowContext>(() => ({
  index: props.index,
  selection: props.selection,
  expanded: props.expanded,
  stateOf,
  changeOf,
  requiresOf,
  autoAddedHintOf,
  isDisabled,
  disabledHint: t("page.settings.roles.editor.not_grantable"),
  toggle: (id, checked) => emit("toggle", id, checked),
  toggleExpanded: (id) => emit("toggle-area", id),
}));

function toggleSection(area: PermissionArea, checked: boolean): void {
  if (area.sectionNode) emit("toggle", area.sectionNode.id, checked);
}

/** Whether an area is the first of its section, under the section heading. */
function opensSection(position: number): boolean {
  const section = props.areas[position]?.sectionNode;
  if (!section) return false;
  return props.areas[position - 1]?.sectionNode?.id !== section.id;
}
</script>

<template>
  <!-- v2 .cs-ptree -->
  <div
    class="px-2 pt-1.5 pb-2.5"
    role="tree"
    :aria-label="t('page.settings.roles.editor.tree_label')"
  >
    <template v-if="props.hits">
      <template v-for="(hit, position) in props.hits" :key="hit.node.id">
        <div
          v-if="isNewHeading(position)"
          class="text-dimmed flex h-8 items-center px-2 font-mono text-[10.5px] font-semibold tracking-[0.12em] uppercase"
        >
          {{ hit.heading }}
        </div>
        <RolePermissionLeaf
          :node="hit.node"
          :state="stateOf(hit.node)"
          :change="changeOf(hit.node.id)"
          :requires="requiresOf(hit.node)"
          :auto-added-hint="autoAddedHintOf(hit.node.id)"
          :disabled="isDisabled(hit.node)"
          :disabled-hint="t('page.settings.roles.editor.not_grantable')"
          :query="props.query"
          @toggle="(checked) => emit('toggle', hit.node.id, checked)"
        />
      </template>
      <p
        v-if="props.hits.length === 0"
        class="text-muted px-2 py-8 text-center text-[13px]"
      >
        {{
          t("page.settings.roles.editor.search_empty", { query: props.query })
        }}
      </p>
    </template>
    <template v-else>
      <template v-for="(area, position) in props.areas" :key="area.node.id">
        <RolePermissionGroup
          v-if="area.sectionNode && opensSection(position)"
          :path="[area.sectionNode.label]"
          :permission-id="area.sectionNode.id"
          :count="
            countSelected(props.index, area.sectionNode.id, props.selection)
          "
          :state="stateOf(area.sectionNode)"
          :disabled="isDisabled(area.sectionNode)"
          :class="position > 0 && 'mt-3'"
          @toggle="(checked) => toggleSection(area, checked)"
        />
        <RolePermissionArea
          :area="area"
          :count="countSelected(props.index, area.node.id, props.selection)"
          :state="stateOf(area.node)"
          :is-expanded="props.expanded.has(area.node.id)"
          :disabled="isDisabled(area.node)"
          @toggle="(checked) => emit('toggle', area.node.id, checked)"
          @toggle-expanded="emit('toggle-area', area.node.id)"
        >
          <RolePermissionBranch
            :nodes="area.node.children ?? []"
            :level="2"
            :context="rowContext"
          />
        </RolePermissionArea>
      </template>
      <p
        v-if="props.areas.length === 0"
        class="text-muted px-2 py-8 text-center text-[13px]"
      >
        {{ t("page.settings.roles.editor.no_permissions") }}
      </p>
    </template>
  </div>
</template>
