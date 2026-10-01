<script setup lang="ts">
type CodeModalTone = "accent" | "error" | "warning";

interface SecurityCodeModalProps {
  title: string;
  description: string;
  icon: string;
  tone?: CodeModalTone;
  codeLabel: string;
  confirmLabel: string;
  loading?: boolean;
  /** Offer to email a code (the email method has no code until asked). */
  canSendEmailCode?: boolean;
}

const props = withDefaults(defineProps<SecurityCodeModalProps>(), {
  tone: "error",
  loading: false,
  canSendEmailCode: false,
});

const emit = defineEmits<{
  confirm: [code: string];
  sendCode: [];
}>();

const CODE_LENGTH = 6;
const CONFIRM_COLORS: Record<CodeModalTone, "primary" | "error" | "warning"> = {
  accent: "primary",
  error: "error",
  warning: "warning",
};

const isOpen = defineModel<boolean>("open", { default: false });
const { t } = useI18n();
const digits = ref<string[]>([]);

const code = computed(() => digits.value.join(""));
const isComplete = computed(() => code.value.length === CODE_LENGTH);

// The code submits once per entry: "complete" and the button can both fire
// before "loading" reaches this component, and a second call would replace
// what the first one produced (a new set of backup codes, for instance).
const submittedCode = ref<string | null>(null);

watch(isOpen, (open) => {
  if (open) digits.value = [];
});

watch(code, () => {
  submittedCode.value = null;
});

function confirm(): void {
  if (!isComplete.value || props.loading) return;
  if (submittedCode.value === code.value) return;
  submittedCode.value = code.value;
  emit("confirm", code.value);
}
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
      <form class="grid gap-4" @submit.prevent="confirm">
        <p class="text-muted text-sm">{{ props.description }}</p>
        <div class="grid gap-2">
          <span class="text-highlighted text-[13px] font-medium">
            {{ props.codeLabel }}
          </span>
          <UPinInput
            v-model="digits"
            :length="CODE_LENGTH"
            otp
            type="number"
            :aria-label="props.codeLabel"
            @complete="confirm"
          />
          <UButton
            v-if="props.canSendEmailCode"
            variant="link"
            size="sm"
            class="w-fit px-0"
            :label="t('page.settings.two_factor.send_code')"
            @click="emit('sendCode')"
          />
        </div>
      </form>
    </template>
    <template #footer>
      <div class="flex w-full items-center justify-end gap-2">
        <span class="text-dimmed me-auto flex items-center gap-1.5 text-xs">
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
          :disabled="!isComplete"
          :label="props.confirmLabel"
          @click="confirm"
        />
      </div>
    </template>
  </UModal>
</template>
