<script setup lang="ts">
import { useTemplateRef } from "vue";
import UButton from "@nuxt/ui/components/Button.vue";
import RoleEditor from "../../build/components/pages/settings/roles/RoleEditor.vue";
import RoleOwnerPanel from "../../build/components/pages/settings/roles/RoleOwnerPanel.vue";
import RolesList from "../../build/components/pages/settings/roles/RolesList.vue";
import {
  NEW_ROLE_ENTRY_ID,
  OWNER_ENTRY_ID,
  ROLES_API_PATH,
  type RoleEditorField,
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
import { useFieldErrors } from "#dms-core/app/composables/useFieldErrors";
import { REQUIRED_MESSAGE } from "#dms-core/app/composables/useFormValidation";
import { useUnsavedChanges } from "#dms-ui/app/composables/unsaved-changes/useUnsavedChanges";
import { useActionConfirm } from "#dms-ui/app/build/composables/confirm/useActionConfirm";

interface RoleEditorHandle {
  inputOf: (field: RoleEditorField) => HTMLInputElement | undefined;
}

const NAME_REQUIRED = "$page.settings.roles.error.name_required";
const NAME_TAKEN = "$page.settings.roles.error.name_taken";
const ROLE_DELETE_CONFIRM_URL = `${ROLES_API_PATH}/{id}/delete-confirm`;

const api = useRolesApi();
const { t } = useI18n();
const toast = useToast();
const { confirmAction } = useActionConfirm();
const { processApiMessage } = useTranslation();

// Before the first await: the header renders it in the server pass. The
// render runs once the setup is done, so it may read what is declared below.
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
const roleEditor = useTemplateRef<RoleEditorHandle>("roleEditor");
// A refused name or description shows under its field, never as a toast.
const fieldErrors = useFieldErrors<RoleEditorField>({
  fields: {
    name: () => roleEditor.value?.inputOf("name"),
    description: () => roleEditor.value?.inputOf("description"),
  },
  // An empty name reads like every other required field.
  codes: {
    [NAME_REQUIRED]: { field: "name", message: REQUIRED_MESSAGE },
    [NAME_TAKEN]: "name",
  },
});

watch(
  () => editor.draft.value.name,
  () => fieldErrors.clear("name"),
);
watch(
  () => editor.draft.value.description,
  () => fieldErrors.clear("description"),
);

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
// state of the role it was opened for. Its errors went with the old draft.
watch(
  () => editor.selectedId.value,
  () => {
    previewId.value = null;
    fieldErrors.clear();
  },
);

// The draft of a role holds unsaved changes: leaving the page, or picking
// another role, asks first (the dashboard's one warning dialog).
const { confirmLeave: confirmDiscard } = useUnsavedChanges({
  dirty: () => editor.isDirty.value && !isReadonly.value,
});

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
  if (!editor.draft.value.name.trim()) {
    await fieldErrors.setError("name", processApiMessage(REQUIRED_MESSAGE));
    return;
  }
  isSaving.value = true;
  fieldErrors.clear();
  const roleId = editor.draft.value.id;
  try {
    if (roleId) {
      await api.updateRole(roleId, editor.payload.value);
      await reloadAndSelect(roleId);
    } else {
      const created = await api.createRole(editor.payload.value);
      await reloadAndSelect(created.id);
    }
    toast.add({
      title: t(
        roleId
          ? "page.settings.roles.editor.saved"
          : "page.settings.roles.editor.created",
      ),
      color: "success",
    });
  } catch (error) {
    if (!(await fieldErrors.applyApiError(error))) useApiError(error);
  } finally {
    isSaving.value = false;
  }
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

/** Deletes the role, moving its holders to `reassignTo` when one is picked. */
async function deleteRole(
  role: RoleSummary,
  reassignTo: string | undefined,
): Promise<void> {
  const force = role.memberCount + role.inviteCount > 0;
  await api.deleteRole(role._id, { force, reassignTo });
  await refresh();
  editor.select(reassignTo ?? editor.roles.value[0]?._id ?? OWNER_ENTRY_ID);
  toast.add({
    title: t("page.settings.roles.editor.deleted"),
    color: "success",
  });
}

// The server words the dialog: who still holds the role, and the role to
// move them to. A refused target role shows under its field.
async function requestDelete(): Promise<void> {
  const role = editor.selectedRole.value;
  if (!role) return;
  await confirmAction(
    { from: ROLE_DELETE_CONFIRM_URL },
    {
      urlParams: { id: encodeURIComponent(role._id) },
      run: (values) =>
        deleteRole(role, (values.reassignTo as string | null) ?? undefined),
    },
  );
}
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
        ref="roleEditor"
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
        :name-error="fieldErrors.errors.name"
        :description-error="fieldErrors.errors.description"
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
