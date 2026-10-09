<script setup lang="ts">
import { inject } from "vue";
import {
  formFieldInjectionKey,
  formStateInjectionKey,
  useFormField,
} from "@nuxt/ui/composables/useFormField";
import DmsChipGroup, {
  type ChipGroupItem,
} from "#dms-ui/app/build/components/form/ChipGroup.vue";

/**
 * The roles of a member as pills, one per role of the workspace, each with
 * what it grants: the invite form and the members table's "Change roles"
 * form both pick roles with it. A form field: `v-model` is the list of role
 * ids, the wrapping `UFormField`'s error rings the pills in the error ink.
 */

interface RoleOption {
  _id: string;
  name: string;
  permissionIds: string[];
  /** Set when what the role grants amounts to owner-level access. */
  warnings?: string[];
}

interface RoleOptionsResponse {
  roles: RoleOption[];
  totalPermissions: number;
}

interface Props {
  id?: string;
  /** Route answering the roles on offer (`InviteRoleOptions`). */
  rolesUrl: string;
  /** The roles page, linked as "Compare roles". */
  rolesPageUrl?: string;
  disabled?: boolean;
  /** While the form loads its values: the pills wait for them. */
  loading?: boolean;
  /**
   * The value the form loaded, whose order a role picked again goes back to:
   * unpicking and picking it again leaves the form clean. Role ids, or the
   * roles as the data API loads them (see `keyMapping`).
   */
  initialValue?: unknown[] | null;
  /**
   * As on a relation field, read by the form to load the member's roles
   * (`{ _id, name }` each) as ids: `keyMapping.value` names the id.
   */
  keyMapping?: { label?: string; value?: string };
  /** As on a relation field: always several roles. */
  multiple?: boolean;
  /**
   * A boolean field of the same form making the member an owner: while it is
   * on, the roles stay visible but inert, as an owner holds every permission.
   */
  ownerField?: string;
  /**
   * Whether no role at all is a valid choice (a member then keeps what every
   * member can do). Off, the empty hint asks for one.
   */
  allowEmpty?: boolean;
}

const props = defineProps<Props>();
const model = defineModel<string[] | null | undefined>();

const { t } = useI18n();
const { $authFetch } = useAuthFetch();
// The wrapping UFormField's error ("pick at least one role") marks the group
// invalid, describes it and rings the pills in the error ink.
const { ariaAttrs } = useFormField();
const formField = inject(formFieldInjectionKey, undefined);
const formState = inject(formStateInjectionKey, undefined);
const hasFieldError = computed(() => !!formField?.value?.error);

const isOwner = computed(
  () => !!props.ownerField && formState?.value?.[props.ownerField] === true,
);
const isInert = computed(() => props.disabled || isOwner.value);
// Without an owner field, the form disables the roles for an owner only.
const showsOwnerHint = computed(() =>
  props.ownerField ? isOwner.value : props.disabled,
);

const options = ref<RoleOptionsResponse>({ roles: [], totalPermissions: 0 });
const isFetching = ref(true);
const isLoading = computed(() => isFetching.value || props.loading);

onMounted(async () => {
  try {
    options.value = await $authFetch<RoleOptionsResponse>(props.rolesUrl);
  } finally {
    isFetching.value = false;
  }
});

const selectedIds = computed(() => new Set(model.value ?? []));
const roleItems = computed<ChipGroupItem[]>(() =>
  options.value.roles.map((role) => ({ value: role._id, label: role.name })),
);
const selectedRoles = computed(() =>
  options.value.roles.filter((role) => selectedIds.value.has(role._id)),
);
// An owner holds every permission anyway: no warning then.
const ownerLevelWarning = computed(() => {
  if (isOwner.value) return undefined;
  const names = selectedRoles.value
    .filter((role) => (role.warnings?.length ?? 0) > 0)
    .map((role) => role.name);
  if (names.length === 0) return undefined;
  return t(
    "page.settings.members.invite.roles_owner_level",
    { roles: names.join(" + ") },
    names.length,
  );
});
const grantedCount = computed(
  () => new Set(selectedRoles.value.flatMap((role) => role.permissionIds)).size,
);

const hint = computed(() => {
  if (showsOwnerHint.value) {
    return t("page.settings.members.invite.roles_owner_hint");
  }
  if (selectedRoles.value.length === 0) {
    return props.allowEmpty
      ? t("page.settings.members.form.roles_hint_none")
      : t("page.settings.members.invite.roles_hint_empty");
  }
  return t("page.settings.members.invite.roles_hint", {
    roles: selectedRoles.value.map((role) => role.name).join(" + "),
    count: grantedCount.value,
    total: options.value.totalPermissions,
  });
});

/** Role ids of a loaded value, whose roles may be `{ _id, name }` objects. */
function toRoleIds(value: unknown[] | null | undefined): string[] {
  const idKey = props.keyMapping?.value ?? "_id";
  return (value ?? []).map((item) =>
    item !== null && typeof item === "object"
      ? String((item as Record<string, unknown>)[idKey])
      : String(item),
  );
}

/** The picked ids, the loaded ones first in their loaded order. */
function inLoadedOrder(ids: string[]): string[] {
  const loaded = toRoleIds(props.initialValue);
  const rank = (id: string) => {
    const index = loaded.indexOf(id);
    return index === -1 ? loaded.length : index;
  };
  // A stable sort: ids picked in this form keep the order they were picked in.
  return [...ids].sort((left, right) => rank(left) - rank(right));
}

function toggle(roleId: string) {
  if (isInert.value) return;
  const current = model.value ?? [];
  const next = selectedIds.value.has(roleId)
    ? current.filter((id) => id !== roleId)
    : [...current, roleId];
  model.value = inLoadedOrder(next);
}
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <USkeleton v-if="isLoading" class="h-7 w-48 rounded-full" />
    <span
      v-else-if="options.roles.length === 0"
      class="text-dimmed text-[12.5px]"
    >
      {{ t("page.settings.members.invite.no_roles") }}
    </span>
    <DmsChipGroup
      v-else
      :id="props.id"
      :items="roleItems"
      :selected="model ?? []"
      :label="t('page.settings.members.invite.field.roles')"
      multiple
      :disabled="isInert"
      :invalid="hasFieldError"
      v-bind="ariaAttrs"
      @pick="toggle"
    />
    <p class="text-muted text-xs">
      {{ hint }}
      <ULink v-if="props.rolesPageUrl" :to="props.rolesPageUrl" class="ms-1">
        {{ t("page.settings.members.invite.compare_roles") }}
      </ULink>
    </p>
    <p
      v-if="ownerLevelWarning"
      class="text-warning flex items-start gap-1.5 text-xs"
      data-role-owner-level
    >
      <UIcon name="i-ph-warning" class="mt-px size-3.5 shrink-0" />
      <span>{{ ownerLevelWarning }}</span>
    </p>
  </div>
</template>
