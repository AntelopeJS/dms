<script setup lang="ts">
import {
  joinPath,
  type SelectionCount,
  type SelectionState,
} from "./role-permissions";

interface RolePermissionGroupProps {
  /** Labels from the area down to the group. */
  path: string[];
  count: SelectionCount;
  /** State of the heading's checkbox (see `checkboxState`). */
  state: SelectionState;
  disabled: boolean;
  /** Id of the permission the heading grants, revealed on hover. */
  permissionId?: string;
}

const props = withDefaults(defineProps<RolePermissionGroupProps>(), {
  permissionId: undefined,
});
const emit = defineEmits<{ toggle: [checked: boolean] }>();
const { processI18n } = useTranslation();

const label = computed(() =>
  joinPath(props.path.map((part) => processI18n(part))),
);
</script>

<template>
  <!-- v2 .cs-psub: a mono eyebrow heading with its own tri-state box. -->
  <div
    :data-permission-id="props.permissionId"
    class="group text-dimmed flex h-8 items-center gap-2 px-2 font-mono text-[10.5px] font-semibold tracking-[0.12em] uppercase"
  >
    <UCheckbox
      :model-value="props.state"
      :disabled="props.disabled"
      :aria-label="label"
      class="me-0.5"
      @update:model-value="emit('toggle', props.state !== true)"
    />
    <span class="min-w-0 truncate">{{ label }}</span>
    <span
      v-if="props.permissionId"
      class="ms-auto truncate font-medium tracking-normal normal-case opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 max-sm:hidden"
    >
      {{ props.permissionId }}
    </span>
    <span
      :class="[
        'shrink-0 tracking-normal',
        props.permissionId ? 'max-sm:ms-auto' : 'ms-auto',
      ]"
    >
      {{ props.count.selected }}/{{ props.count.total }}
    </span>
  </div>
</template>
