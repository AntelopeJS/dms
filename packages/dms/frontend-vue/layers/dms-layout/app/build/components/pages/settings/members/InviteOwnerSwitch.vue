<script setup lang="ts">
interface Props {
  id?: string;
  disabled?: boolean;
}

const props = defineProps<Props>();
const model = defineModel<boolean | null | undefined>();

const { t } = useI18n();

const isOwner = computed({
  get: () => model.value === true,
  set: (value: boolean) => (model.value = value),
});
</script>

<template>
  <div
    class="border-default flex items-start gap-3 rounded-md border bg-(--dms-bg-muted) px-3.5 py-3"
  >
    <span
      class="border-default bg-default text-muted grid size-[34px] shrink-0 place-items-center rounded-[9px] border"
    >
      <UIcon name="i-ph-crown" class="size-[18px]" />
    </span>
    <label :for="props.id" class="min-w-0 flex-1 cursor-pointer">
      <b class="text-highlighted block text-[13px] font-semibold">
        {{ t("page.settings.members.invite.field.tenant_owner") }}
      </b>
      <span class="text-muted mt-0.5 block text-[12.5px]/normal">
        {{ t("page.settings.members.invite.field.tenant_owner_description") }}
      </span>
    </label>
    <USwitch
      :id="props.id"
      v-model="isOwner"
      :disabled="props.disabled"
      class="mt-0.5"
    />
  </div>
</template>
