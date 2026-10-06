<script lang="ts">
export type SecurityDialogTone = "primary" | "error" | "warning";
</script>

<script setup lang="ts">
interface SecurityDialogFrameProps {
  title: string;
  icon: string;
  tone?: SecurityDialogTone;
  confirmLabel: string;
  loading?: boolean;
}

const props = withDefaults(defineProps<SecurityDialogFrameProps>(), {
  tone: "error",
  loading: false,
});

const emit = defineEmits<{
  confirm: [];
}>();

const CONFIRM_COLORS: Record<
  SecurityDialogTone,
  "primary" | "error" | "warning"
> = {
  primary: "primary",
  error: "error",
  warning: "warning",
};

const isOpen = defineModel<boolean>("open", { default: false });
const { t } = useI18n();
</script>

<template>
  <UModal v-model:open="isOpen" :ui="{ content: 'max-w-md' }">
    <template #header>
      <div class="flex items-start gap-3">
        <DmsIconWell :icon="props.icon" :tone="props.tone" size="xl" />
        <div class="grid gap-1 pt-1">
          <h3 class="text-highlighted text-base font-semibold">
            {{ props.title }}
          </h3>
        </div>
      </div>
    </template>
    <template #body>
      <slot />
    </template>
    <template #footer>
      <!-- Phones: no Esc hint (no keyboard) and the buttons may wrap. -->
      <div class="flex w-full flex-wrap items-center justify-end gap-2">
        <span
          class="text-dimmed me-auto flex items-center gap-1.5 text-xs max-sm:hidden"
        >
          <UKbd value="Esc" size="sm" />
          {{ t("page.settings.security.esc_to_cancel") }}
        </span>
        <UButton
          color="neutral"
          variant="outline"
          :label="t('page.settings.security.cancel')"
          @click="isOpen = false"
        />
        <UButton
          :color="CONFIRM_COLORS[props.tone]"
          :loading="props.loading"
          :label="props.confirmLabel"
          @click="emit('confirm')"
        />
      </div>
    </template>
  </UModal>
</template>
