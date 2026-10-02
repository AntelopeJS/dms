<script setup lang="ts">
import { useFormField } from "@nuxt/ui/composables/useFormField";

interface RoleOption {
  _id: string;
  name: string;
  permissionIds: string[];
}

interface RoleOptionsResponse {
  roles: RoleOption[];
  totalPermissions: number;
}

interface Props {
  id?: string;
  rolesUrl: string;
  rolesPageUrl?: string;
  disabled?: boolean;
}

const props = defineProps<Props>();
const model = defineModel<string[] | null | undefined>();

const { t } = useI18n();
const { $authFetch } = useAuthFetch();
// The wrapping UFormField's error ("pick at least one role") marks the group
// invalid and describes it.
const { ariaAttrs } = useFormField();

const options = ref<RoleOptionsResponse>({ roles: [], totalPermissions: 0 });
const isLoading = ref(true);

onMounted(async () => {
  try {
    options.value = await $authFetch<RoleOptionsResponse>(props.rolesUrl);
  } finally {
    isLoading.value = false;
  }
});

const selectedIds = computed(() => new Set(model.value ?? []));
const selectedRoles = computed(() =>
  options.value.roles.filter((role) => selectedIds.value.has(role._id)),
);
const grantedCount = computed(
  () => new Set(selectedRoles.value.flatMap((role) => role.permissionIds)).size,
);

const hint = computed(() => {
  if (props.disabled) return t("page.settings.members.invite.roles_owner_hint");
  if (selectedRoles.value.length === 0) {
    return t("page.settings.members.invite.roles_hint_empty");
  }
  return t("page.settings.members.invite.roles_hint", {
    roles: selectedRoles.value.map((role) => role.name).join(" + "),
    count: grantedCount.value,
    total: options.value.totalPermissions,
  });
});

function toggle(roleId: string) {
  if (props.disabled) return;
  const next = new Set(selectedIds.value);
  if (next.has(roleId)) next.delete(roleId);
  else next.add(roleId);
  model.value = [...next];
}
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <div
      :id="props.id"
      class="flex flex-wrap gap-1.5"
      role="group"
      :aria-label="t('page.settings.members.invite.field.roles')"
      v-bind="ariaAttrs"
    >
      <USkeleton v-if="isLoading" class="h-[26px] w-48 rounded-full" />
      <button
        v-for="role in options.roles"
        :key="role._id"
        type="button"
        :aria-pressed="selectedIds.has(role._id)"
        :disabled="props.disabled"
        class="inline-flex h-[26px] items-center gap-[5px] rounded-full border px-[11px] font-mono text-[11.5px] font-[550] whitespace-nowrap transition-colors"
        :class="[
          selectedIds.has(role._id)
            ? 'border-primary bg-primary/10 text-primary'
            : 'border-accented text-toned hover:bg-elevated',
          props.disabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer',
        ]"
        @click="toggle(role._id)"
      >
        <UIcon
          v-if="selectedIds.has(role._id)"
          name="i-ph-check"
          class="size-3"
        />
        {{ role.name }}
      </button>
      <span
        v-if="!isLoading && options.roles.length === 0"
        class="text-dimmed text-[12.5px]"
      >
        {{ t("page.settings.members.invite.no_roles") }}
      </span>
    </div>
    <p class="text-muted text-xs">
      {{ hint }}
      <ULink
        v-if="props.rolesPageUrl"
        :to="props.rolesPageUrl"
        class="text-primary ms-1 font-[550] hover:underline"
      >
        {{ t("page.settings.members.invite.compare_roles") }}
      </ULink>
    </p>
  </div>
</template>
