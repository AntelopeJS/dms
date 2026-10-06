<script setup lang="ts">
import { useTemplateRef } from "vue";
import DmsOtpInput from "#dms-ui/app/build/components/form/OtpInput.vue";
import { codeEntryError } from "#dms-core/app/composables/useFormValidation";
import { useCodeFieldError } from "../../../../../composables/settings/security/useCodeFieldError";

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
/** A code the API refused, shown under the cells; typing clears it. */
const error = defineModel<string | undefined>("error");
const { t } = useI18n();
const { processApiMessage } = useTranslation();
const digits = ref<string[]>([]);
const codeField = useTemplateRef<HTMLElement>("codeField");

const { flag } = useCodeFieldError(digits, error, codeField);

const code = computed(() => digits.value.join(""));

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
  if (props.loading) return;
  // An empty or partial code is flagged under the cells, not sent.
  const missing = codeEntryError(digits.value, CODE_LENGTH);
  if (missing) {
    flag(processApiMessage(missing));
    return;
  }
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
        <div ref="codeField" class="grid gap-2">
          <span class="text-highlighted text-[13px] font-medium">
            {{ props.codeLabel }}
          </span>
          <DmsOtpInput
            v-model="digits"
            :label="props.codeLabel"
            :length="CODE_LENGTH"
            type="number"
            is-otp
            :error="error"
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
          @click="confirm"
        />
      </div>
    </template>
  </UModal>
</template>
