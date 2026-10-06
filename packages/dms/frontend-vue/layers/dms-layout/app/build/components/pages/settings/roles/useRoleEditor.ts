import { watch, type Ref } from "vue";
import { useNavBadges } from "#dms-ui/app/build/composables/navigation/useNavBadges";
import {
  buildPermissionAreas,
  buildPermissionIndex,
  diffPermissions,
  grantPermission,
  revokePermission,
} from "./role-permissions";
import {
  NEW_ROLE_ENTRY_ID,
  OWNER_ENTRY_ID,
  type RoleDraft,
  type RolePermissionNode,
  type RolesOverview,
  type RoleSummary,
} from "./role-types";

// The Owner row the list shows above the stored roles.
const OWNER_ROW = 1;
const ROLES_PAGE_ID = "settings.workspace.roles";

/** What the roles page loads: the roles and the permission tree. */
export interface RolesPageData {
  overview: RolesOverview;
  tree: RolePermissionNode[];
}

const NAMED_MEMBERS_LIMIT = 2;

function draftOf(role: RoleSummary | null): RoleDraft {
  return {
    id: role?._id ?? null,
    name: role?.name ?? "",
    description: role?.description ?? "",
    permissions: [...(role?.permissions ?? [])],
  };
}

/** What the change summary of the save bar is computed from. */
interface RoleChangeSource {
  draft: Ref<RoleDraft>;
  saved: Ref<RoleDraft>;
  selection: Ref<Set<string>>;
  selectedRole: Ref<RoleSummary | null>;
  isNew: Ref<boolean>;
}

function appliesToLabel(
  role: RoleSummary | null,
  t: ReturnType<typeof useI18n>["t"],
): string | undefined {
  if (!role || role.memberCount === 0) return undefined;
  if (role.memberCount > NAMED_MEMBERS_LIMIT) {
    return t("page.settings.roles.editor.applies_to_count", role.memberCount);
  }
  const names = role.members.map((member) => member.name).join(", ");
  return t("page.settings.roles.editor.applies_to", { names });
}

/** Whether the draft differs from the saved role, and how, for the save bar. */
function useRoleChanges(source: RoleChangeSource) {
  const { t } = useI18n();
  const diff = computed(() =>
    diffPermissions(source.saved.value.permissions, source.selection.value),
  );
  const isNameChanged = computed(
    () => source.draft.value.name !== source.saved.value.name,
  );
  const isDescriptionChanged = computed(
    () => source.draft.value.description !== source.saved.value.description,
  );
  const isDirty = computed(
    () =>
      source.isNew.value ||
      isNameChanged.value ||
      isDescriptionChanged.value ||
      diff.value.added.length > 0 ||
      diff.value.removed.length > 0,
  );
  const changes = computed(() =>
    [
      isNameChanged.value && t("page.settings.roles.editor.changed_name"),
      isDescriptionChanged.value &&
        t("page.settings.roles.editor.changed_description"),
      diff.value.added.length > 0 &&
        t("page.settings.roles.editor.changed_added", diff.value.added.length),
      diff.value.removed.length > 0 &&
        t(
          "page.settings.roles.editor.changed_removed",
          diff.value.removed.length,
        ),
      appliesToLabel(source.selectedRole.value, t),
    ].filter((label): label is string => Boolean(label)),
  );
  return { isDirty, changes };
}

/**
 * State of the roles editor: which entry is selected, the draft being edited,
 * its permission selection and how it differs from the saved role.
 */
export function useRoleEditor(data: Ref<RolesPageData | null>) {
  const { processI18n } = useTranslation();

  const selectedId = ref<string>(OWNER_ENTRY_ID);
  const draft = ref<RoleDraft>(draftOf(null));
  const selection = ref<Set<string>>(new Set());
  const autoAdded = ref<Map<string, string[]>>(new Map());

  const roles = computed(() => data.value?.overview.roles ?? []);

  // The settings nav shows the role count — the stored roles and the Owner
  // row, as the list and the server count them; keep it current as roles
  // are created, duplicated or deleted here.
  const { setNavBadge } = useNavBadges();
  watch(
    () => data.value?.overview.roles.length,
    (count) => {
      if (count !== undefined) {
        setNavBadge(ROLES_PAGE_ID, String(count + OWNER_ROW));
      }
    },
    { immediate: true },
  );
  // Served in menu order, which the settings nav follows too.
  const tree = computed(() => data.value?.tree ?? []);
  const index = computed(() => buildPermissionIndex(tree.value));
  const areas = computed(() => buildPermissionAreas(tree.value, processI18n));
  const selectedRole = computed(
    () => roles.value.find((role) => role._id === selectedId.value) ?? null,
  );
  const isNew = computed(() => selectedId.value === NEW_ROLE_ENTRY_ID);
  const saved = computed(() => draftOf(selectedRole.value));
  const savedIds = computed(() => new Set(saved.value.permissions));
  const { isDirty, changes } = useRoleChanges({
    draft,
    saved,
    selection,
    selectedRole,
    isNew,
  });

  const grantable = computed(() => {
    const ids = data.value?.overview.grantable;
    return ids ? new Set(ids) : null;
  });
  const canGrant = (id: string) => !grantable.value || grantable.value.has(id);

  function reset(): void {
    draft.value = draftOf(isNew.value ? null : selectedRole.value);
    selection.value = new Set(draft.value.permissions);
    autoAdded.value = new Map();
  }

  function select(id: string): void {
    selectedId.value = id;
    reset();
  }

  function selectDefault(): void {
    const [first] = roles.value;
    select(first?._id ?? OWNER_ENTRY_ID);
  }

  function toggle(id: string, checked: boolean): void {
    const nextAutoAdded = new Map(autoAdded.value);
    nextAutoAdded.delete(id);
    if (checked) {
      const grant = grantPermission(index.value, selection.value, id, canGrant);
      selection.value = grant.selection;
      if (grant.autoAdded.length > 0) nextAutoAdded.set(id, grant.autoAdded);
    } else {
      selection.value = revokePermission(index.value, selection.value, id);
    }
    autoAdded.value = nextAutoAdded;
  }

  const payload = computed<RoleDraft>(() => ({
    ...draft.value,
    permissions: [...selection.value],
  }));

  return {
    selectedId,
    selectedRole,
    draft,
    selection,
    autoAdded,
    roles,
    index,
    areas,
    isNew,
    savedIds,
    isDirty,
    changes,
    payload,
    canGrant,
    reset,
    select,
    selectDefault,
    toggle,
  };
}
