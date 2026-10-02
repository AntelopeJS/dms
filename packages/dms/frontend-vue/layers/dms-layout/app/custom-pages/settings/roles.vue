<script setup lang="ts">
import type { Ref } from "vue";
import UButton from "@nuxt/ui/components/Button.vue";
import UFormField from "@nuxt/ui/components/FormField.vue";
import USelect from "@nuxt/ui/components/Select.vue";
import RoleEditor from "../../build/components/pages/settings/roles/RoleEditor.vue";
import RoleOwnerPanel from "../../build/components/pages/settings/roles/RoleOwnerPanel.vue";
import RolesList from "../../build/components/pages/settings/roles/RolesList.vue";
import {
  NEW_ROLE_ENTRY_ID,
  OWNER_ENTRY_ID,
  type RoleSummary,
} from "../../build/components/pages/settings/roles/role-types";
import {
  type RolesPageData,
  useRoleEditor,
} from "../../build/components/pages/settings/roles/useRoleEditor";
import { useRolesApi } from "../../build/components/pages/settings/roles/useRolesApi";
import { usePageHeaderActions } from "../../composables/layout/usePageHeaderActions";
import {
  type PermissionPreviewInput,
  usePermissionPreview,
} from "#dms-core/app/composables/auth/usePermissionPreview";

const api = useRolesApi();
const { t } = useI18n();
const toast = useToast();
const { confirm } = useConfirm();

const { data, refresh } = await useDmsAsyncData<RolesPageData | null>(
  "settings-roles-editor",
  async () => {
    const [overview, tree] = await Promise.all([
      api.fetchOverview(),
      api.fetchTree(),
    ]);
    return { overview, tree };
  },
  { default: () => null },
);

const editor = useRoleEditor(data);
const isSaving = ref(false);
// Reka selects refuse an empty value, so "keep nobody" needs its own id.
const NO_REASSIGN = "__none__";

const capabilities = computed(() => data.value?.overview.capabilities);
const isReadonly = computed(() =>
  editor.isNew.value
    ? !capabilities.value?.canAdd
    : !capabilities.value?.canEdit,
);

editor.selectDefault();

// "Preview as role" opens a tab on the dashboard that browses it as the role
// would, edits included; while that tab is open it follows the editor's draft.
// Previewing is reading the dashboard through a role, so it asks for the same
// right as editing one.
const preview = usePermissionPreview();
const homepage = useHomepage();
const route = useDmsRoute();
const previewId = ref<string | null>(null);
// Not from inside a preview: that tab is already looking through a role.
const canPreview = computed(
  () => (capabilities.value?.canEdit ?? false) && !preview.isActive.value,
);
const previewInput = computed<PermissionPreviewInput>(() => ({
  roleId: editor.draft.value.id,
  roleName: editor.draft.value.name,
  permissions: editor.payload.value.permissions,
  unsaved: editor.isDirty.value,
  returnTo: route.path,
}));

function openPreview(): void {
  previewId.value = preview.start(previewInput.value, homepage);
}

watch(previewInput, (input) => {
  if (previewId.value) preview.update(previewId.value, input);
});
// Another role in the editor is another preview: the open tab keeps the last
// state of the role it was opened for.
watch(
  () => editor.selectedId.value,
  () => {
    previewId.value = null;
  },
);

async function confirmDiscard(): Promise<boolean> {
  if (!editor.isDirty.value) return true;
  return confirm({
    title: t("page.settings.roles.editor.discard_title"),
    description: t("page.settings.roles.editor.discard_description"),
    confirmLabel: t("page.settings.roles.editor.discard_confirm"),
    cancelLabel: t("page.settings.roles.editor.keep_editing"),
    confirmColor: "error",
  });
}

async function selectEntry(id: string): Promise<void> {
  if (id === editor.selectedId.value) return;
  if (!(await confirmDiscard())) return;
  editor.select(id);
}

async function reloadAndSelect(id: string): Promise<void> {
  await refresh();
  editor.select(id);
}

async function runMutation(
  mutation: () => Promise<void>,
  successKey: string,
): Promise<void> {
  try {
    await mutation();
    toast.add({ title: t(successKey), color: "success" });
  } catch (error) {
    useApiError(error);
  }
}

async function save(): Promise<void> {
  isSaving.value = true;
  const roleId = editor.draft.value.id;
  await runMutation(
    async () => {
      if (roleId) {
        await api.updateRole(roleId, editor.payload.value);
        await reloadAndSelect(roleId);
        return;
      }
      const created = await api.createRole(editor.payload.value);
      await reloadAndSelect(created.id);
    },
    roleId
      ? "page.settings.roles.editor.saved"
      : "page.settings.roles.editor.created",
  );
  isSaving.value = false;
}

function discard(): void {
  if (editor.isNew.value) {
    editor.selectDefault();
    return;
  }
  editor.reset();
}

async function duplicate(): Promise<void> {
  const role = editor.selectedRole.value;
  if (!role || !(await confirmDiscard())) return;
  await runMutation(async () => {
    const name = t("page.settings.roles.editor.copy_name", { name: role.name });
    const created = await api.duplicateRole(role._id, name);
    await reloadAndSelect(created.id);
  }, "page.settings.roles.editor.duplicated");
}

/** Deletes the role; resolves `false` (error toasted) to keep the dialog open. */
async function deleteRole(
  role: RoleSummary,
  reassignTo: string | undefined,
): Promise<boolean> {
  try {
    const force = role.memberCount + role.inviteCount > 0;
    await api.deleteRole(role._id, { force, reassignTo });
    await refresh();
    editor.select(reassignTo ?? editor.roles.value[0]?._id ?? OWNER_ENTRY_ID);
    toast.add({
      title: t("page.settings.roles.editor.deleted"),
      color: "success",
    });
    return true;
  } catch (error) {
    useApiError(error);
    return false;
  }
}

/** v2 delete confirm: members of a role in use can move to another role. */
function reassignField(role: RoleSummary, reassignTo: Ref<string>) {
  const items = [
    {
      label: t("page.settings.roles.editor.reassign_none"),
      value: NO_REASSIGN,
    },
    ...(data.value?.overview.roles ?? [])
      .filter((entry) => entry._id !== role._id)
      .map((entry) => ({ label: entry.name, value: entry._id })),
  ];
  return () =>
    h(
      UFormField,
      { label: t("page.settings.roles.editor.reassign_label") },
      () =>
        h(USelect, {
          modelValue: reassignTo.value,
          items,
          class: "w-full",
          "onUpdate:modelValue": (value: string) => {
            reassignTo.value = value;
          },
        }),
    );
}

async function requestDelete(): Promise<void> {
  const role = editor.selectedRole.value;
  if (!role) return;
  const holders = role.memberCount + role.inviteCount;
  const reassignTo = ref(NO_REASSIGN);
  await confirm({
    title: t("page.settings.roles.editor.delete_title", { name: role.name }),
    description:
      holders > 0
        ? t("page.settings.roles.editor.delete_in_use", holders)
        : t("page.settings.roles.editor.delete_unused"),
    icon: "i-ph-trash",
    confirmColor: "error",
    confirmLabel: t("page.settings.roles.editor.delete_confirm"),
    cancelLabel: t("page.settings.roles.editor.cancel"),
    body: holders > 0 ? reassignField(role, reassignTo) : undefined,
    onConfirm: () =>
      deleteRole(
        role,
        reassignTo.value === NO_REASSIGN ? undefined : reassignTo.value,
      ),
  });
}

usePageHeaderActions(() =>
  h(UButton, {
    label: t("page.settings.roles.editor.new_role"),
    icon: "i-ph-plus",
    color: "neutral",
    variant: "outline",
    disabled: !capabilities.value?.canAdd,
    onClick: () => selectEntry(NEW_ROLE_ENTRY_ID),
  }),
);
</script>

<template>
  <div class="@container pb-16">
    <div
      v-if="data"
      class="grid items-start gap-4 @3xl:grid-cols-[256px_minmax(0,1fr)]"
    >
      <RolesList
        :roles="data.overview.roles"
        :owners="data.overview.owners"
        :total-permissions="data.overview.totalPermissions"
        :selected-id="editor.selectedId.value"
        :draft-name="editor.isNew.value ? editor.draft.value.name : null"
        @select="selectEntry"
      />
      <RoleOwnerPanel
        v-if="editor.selectedId.value === OWNER_ENTRY_ID"
        :owners="data.overview.owners"
      />
      <RoleEditor
        v-else
        v-model:name="editor.draft.value.name"
        v-model:description="editor.draft.value.description"
        :is-new="editor.isNew.value"
        :member-count="editor.selectedRole.value?.memberCount ?? 0"
        :members="editor.selectedRole.value?.members ?? []"
        :areas="editor.areas.value"
        :index="editor.index.value"
        :selection="editor.selection.value"
        :saved="editor.savedIds.value"
        :auto-added="editor.autoAdded.value"
        :total-permissions="data.overview.totalPermissions"
        :can-grant="editor.canGrant"
        :readonly="isReadonly"
        :can-duplicate="capabilities?.canAdd ?? false"
        :can-delete="capabilities?.canDelete ?? false"
        :dirty="editor.isDirty.value && !isReadonly"
        :saving="isSaving"
        :changes="editor.changes.value"
        :can-preview="canPreview"
        @toggle="editor.toggle"
        @save="save"
        @discard="discard"
        @duplicate="duplicate"
        @delete="requestDelete"
        @preview="openPreview"
      />
    </div>
  </div>
</template>
