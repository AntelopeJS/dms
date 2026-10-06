<script setup lang="ts">
import type { DropdownMenuItem } from "@nuxt/ui";
import { useTemplateRef } from "vue";
import DmsCard from "#dms-ui/app/components/card/Card.vue";
import RolePermissionTree from "./RolePermissionTree.vue";
import RolePanelHead from "./RolePanelHead.vue";
import {
  buildPermissionLevels,
  collapseOneLevel,
  expandOneLevel,
  nextCollapseDepth,
  nextExpandDepth,
  openDepth,
  type PermissionArea,
  type PermissionIndex,
  searchPermissions,
} from "./role-permissions";
import {
  ROLE_DESCRIPTION_MAX_LENGTH,
  ROLE_NAME_MAX_LENGTH,
  type RoleEditorField,
  type RoleMemberPreview,
} from "./role-types";

interface RoleEditorProps {
  isNew: boolean;
  memberCount: number;
  members: RoleMemberPreview[];
  areas: PermissionArea[];
  index: PermissionIndex;
  selection: Set<string>;
  saved: Set<string>;
  autoAdded: Map<string, string[]>;
  totalPermissions: number;
  canGrant: (permissionId: string) => boolean;
  readonly: boolean;
  canDuplicate: boolean;
  canDelete: boolean;
  dirty: boolean;
  saving: boolean;
  changes: string[];
  /** Whether "Preview as role" is offered (the viewer may edit roles). */
  canPreview?: boolean;
  /** Inline error under the name (required, already taken…). */
  nameError?: string;
  /** Inline error under the description. */
  descriptionError?: string;
}

interface InputHandle {
  inputRef?: HTMLInputElement;
}

const props = defineProps<RoleEditorProps>();
const emit = defineEmits<{
  toggle: [id: string, checked: boolean];
  save: [];
  discard: [];
  duplicate: [];
  delete: [];
  preview: [];
}>();

const name = defineModel<string>("name", { required: true });
const description = defineModel<string>("description", { required: true });

const { t } = useI18n();
const { processI18n } = useTranslation();
const nameInput = useTemplateRef<InputHandle>("nameInput");
const descriptionInput = useTemplateRef<InputHandle>("descriptionInput");

defineExpose({
  /** The input of a field, which the page focuses when an error lands on it. */
  inputOf: (field: RoleEditorField): HTMLInputElement | undefined =>
    (field === "name" ? nameInput : descriptionInput).value?.inputRef,
});

const NAMED_MEMBERS_LIMIT = 2;

const query = ref("");
// Every collapsible row, areas and nested rows alike, starts closed: the user
// opens what they need. A search shows its hits instead of the tree and never
// touches this set, so clearing it brings the previous state back as is.
const expanded = ref<Set<string>>(new Set());

const hits = computed(() =>
  query.value.trim()
    ? searchPermissions(props.index, props.areas, query.value, processI18n)
    : null,
);
const hitAreaCount = computed(
  () => new Set((hits.value ?? []).map((hit) => hit.areaId)).size,
);
const selectedCount = computed(
  () => props.index.allIds.filter((id) => props.selection.has(id)).length,
);

const memberLine = computed(() => {
  const count = t(
    "page.settings.roles.editor.members_count",
    props.memberCount,
  );
  if (props.memberCount === 0 || props.memberCount > NAMED_MEMBERS_LIMIT) {
    return count;
  }
  return `${count} · ${props.members.map((member) => member.name).join(", ")}`;
});

const previewLabel = computed(() =>
  t("page.settings.roles.preview.button", {
    role: name.value || t("page.settings.roles.editor.untitled"),
  }),
);

const actions = computed<DropdownMenuItem[]>(() => [
  {
    label: t("page.settings.roles.editor.duplicate"),
    icon: "i-ph-copy",
    disabled: !props.canDuplicate,
    onSelect: () => emit("duplicate"),
  },
  {
    label: t("page.settings.roles.editor.delete"),
    icon: "i-ph-trash",
    color: "error",
    disabled: !props.canDelete,
    onSelect: () => emit("delete"),
  },
]);

// The tree opens and closes one depth per click (areas are depth 1): expand
// opens the shallowest depth not fully open, collapse closes the deepest
// depth with a row shown open (see `nextExpandDepth`, `nextCollapseDepth`).
const levels = computed(() => buildPermissionLevels(props.areas));
const depthCount = computed(() => levels.value.levels.length);
const canExpand = computed(
  () => nextExpandDepth(levels.value, expanded.value) !== null,
);
const canCollapse = computed(
  () => nextCollapseDepth(levels.value, expanded.value) !== null,
);
const depthLabel = computed(() => ({
  level: openDepth(levels.value, expanded.value),
  total: depthCount.value,
}));

function expandLevel(): void {
  expanded.value = expandOneLevel(levels.value, expanded.value);
}

function collapseLevel(): void {
  expanded.value = collapseOneLevel(levels.value, expanded.value);
}

function toggleArea(id: string): void {
  const next = new Set(expanded.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  expanded.value = next;
}
</script>

<template>
  <!-- v2 .cs-editor: the selected role's head, its name and description,
       then the permission tree with its tools and the save bar. -->
  <DmsCard
    as="section"
    :padded="false"
    class="@container/editor min-w-0"
    aria-labelledby="role-editor-title"
  >
    <template #header>
      <RolePanelHead
        icon="i-ph-key"
        title-id="role-editor-title"
        :meta="props.isNew ? undefined : memberLine"
      >
        <span class="truncate">
          {{ name || t("page.settings.roles.editor.untitled") }}
        </span>
      </RolePanelHead>
    </template>
    <template #actions>
      <UButton
        v-if="props.canPreview"
        icon="i-ph-eye"
        color="neutral"
        variant="outline"
        size="sm"
        :aria-label="previewLabel"
        :title="previewLabel"
        @click="emit('preview')"
      >
        <span class="hidden max-w-[200px] truncate @3xl/editor:inline">
          {{ previewLabel }}
        </span>
      </UButton>
      <UDropdownMenu
        v-if="!props.isNew"
        :items="actions"
        :content="{ align: 'end' }"
      >
        <UButton
          icon="i-ph-dots-three"
          color="neutral"
          variant="outline"
          size="sm"
          :aria-label="t('page.settings.roles.editor.more_actions')"
        />
      </UDropdownMenu>
    </template>

    <div
      class="border-default grid gap-x-4 gap-y-3.5 border-b px-[18px] py-4 sm:grid-cols-[minmax(0,220px)_minmax(0,1fr)]"
    >
      <UFormField
        :label="t('page.settings.roles.editor.field_name')"
        :error="props.nameError"
        required
      >
        <UInput
          ref="nameInput"
          v-model="name"
          class="w-full"
          :maxlength="ROLE_NAME_MAX_LENGTH"
          :disabled="props.readonly"
          :placeholder="t('page.settings.roles.editor.placeholder_name')"
        />
        <template #error="{ error }">
          <template v-if="error">
            <UIcon name="i-ph-warning-circle" class="size-3.5 shrink-0" />
            {{ error }}
          </template>
        </template>
      </UFormField>
      <UFormField
        :label="t('page.settings.roles.editor.field_description')"
        :hint="t('page.settings.roles.editor.optional')"
        :error="props.descriptionError"
      >
        <UInput
          ref="descriptionInput"
          v-model="description"
          class="w-full"
          :maxlength="ROLE_DESCRIPTION_MAX_LENGTH"
          :disabled="props.readonly"
          :placeholder="t('page.settings.roles.editor.placeholder_description')"
        />
        <template #error="{ error }">
          <template v-if="error">
            <UIcon name="i-ph-warning-circle" class="size-3.5 shrink-0" />
            {{ error }}
          </template>
        </template>
      </UFormField>
    </div>

    <!-- Phones (editor under 448px): the search takes the first line, the
         level tools and the count share the next. -->
    <div
      class="border-muted flex flex-wrap items-center gap-2 border-b py-3 ps-[18px] pe-4"
    >
      <DmsSearchInput
        v-model="query"
        size="sm"
        class="max-w-[280px] flex-[1_1_180px] @max-md/editor:max-w-none @max-md/editor:basis-full"
        :placeholder="t('page.settings.roles.editor.search_permissions')"
      />
      <template v-if="!hits">
        <UButton
          icon="i-ph-arrows-out-simple"
          color="neutral"
          variant="ghost"
          size="sm"
          :disabled="!canExpand"
          :aria-label="t('page.settings.roles.editor.expand_level')"
          :title="t('page.settings.roles.editor.expand_level_hint')"
          data-role-tree-expand
          @click="expandLevel"
        >
          <span class="hidden @3xl/editor:inline">
            {{ t("page.settings.roles.editor.expand") }}
          </span>
        </UButton>
        <UButton
          icon="i-ph-arrows-in-simple"
          color="neutral"
          variant="ghost"
          size="sm"
          :disabled="!canCollapse"
          :aria-label="t('page.settings.roles.editor.collapse_level')"
          :title="t('page.settings.roles.editor.collapse_level_hint')"
          data-role-tree-collapse
          @click="collapseLevel"
        >
          <span class="hidden @3xl/editor:inline">
            {{ t("page.settings.roles.editor.collapse") }}
          </span>
        </UButton>
        <span
          v-if="depthCount > 0"
          class="text-dimmed font-mono text-[10.5px] font-medium whitespace-nowrap tabular-nums"
          role="status"
          :title="t('page.settings.roles.editor.depth_hint', depthLabel)"
          data-role-tree-depth
        >
          <span aria-hidden="true">
            {{ t("page.settings.roles.editor.depth", depthLabel) }}
          </span>
          <span class="sr-only">
            {{ t("page.settings.roles.editor.depth_hint", depthLabel) }}
          </span>
        </span>
      </template>
      <div
        class="text-muted ms-auto flex items-center gap-2.5 font-mono text-xs font-medium whitespace-nowrap"
      >
        <template v-if="hits">
          <span>
            <b class="text-highlighted font-[650]">{{ hits.length }}</b>
            {{ t("page.settings.roles.editor.matches", hits.length) }}
            {{ t("page.settings.roles.editor.in_areas", hitAreaCount) }}
          </span>
        </template>
        <template v-else>
          <DmsMeter
            as="span"
            size="xs"
            class="w-20 shrink-0 @max-md/editor:hidden"
            :value="selectedCount"
            :max="props.totalPermissions"
          />
          <span>
            <b class="text-highlighted font-[650]">{{ selectedCount }}</b>
            {{
              t("page.settings.roles.editor.of_selected", {
                total: props.totalPermissions,
              })
            }}
          </span>
        </template>
      </div>
    </div>

    <RolePermissionTree
      :areas="props.areas"
      :index="props.index"
      :selection="props.selection"
      :saved="props.saved"
      :auto-added="props.autoAdded"
      :expanded="expanded"
      :hits="hits"
      :query="query"
      :can-grant="props.canGrant"
      :readonly="props.readonly"
      @toggle="(id, checked) => emit('toggle', id, checked)"
      @toggle-area="toggleArea"
    />

    <DmsSaveBar
      class="mx-3 mb-3"
      :dirty="props.dirty"
      :saving="props.saving"
      :changes="props.changes"
      @discard="emit('discard')"
      @save="emit('save')"
    />
  </DmsCard>
</template>
