<script setup lang="ts">
import { useTemplateRef } from "vue";
import DmsOtpInput from "#dms-ui/app/build/components/form/OtpInput.vue";
import { codeEntryError } from "#dms-core/app/composables/useFormValidation";
import { useCodeFieldError } from "../../../../composables/settings/security/useCodeFieldError";
import SecurityDialogFrame, {
  type SecurityDialogTone,
} from "./SecurityDialogFrame.vue";

interface SecurityCodeModalProps {
  title: string;
  description: string;
  icon: string;
  tone?: SecurityDialogTone;
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
  <SecurityDialogFrame
    v-model:open="isOpen"
    :title="props.title"
    :icon="props.icon"
    :tone="props.tone"
    :confirm-label="props.confirmLabel"
    :loading="props.loading"
    @confirm="confirm"
  >
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
  </SecurityDialogFrame>
</template>
