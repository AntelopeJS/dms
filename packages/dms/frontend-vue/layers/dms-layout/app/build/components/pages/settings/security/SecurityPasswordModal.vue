<script setup lang="ts">
import { TEXT_LINK_CLASS } from "#dms-ui/app/build/utils/textLink";
import DmsPasswordInput from "#dms-ui/app/build/components/form/PasswordInput.vue";
import { REQUIRED_MESSAGE } from "#dms-core/app/composables/useFormValidation";
import SecurityDialogFrame, {
  type SecurityDialogTone,
} from "./SecurityDialogFrame.vue";
import SecurityPanelField from "./SecurityPanelField.vue";

interface SecurityPasswordModalProps {
  title: string;
  description: string;
  icon: string;
  tone?: SecurityDialogTone;
  confirmLabel: string;
  loading?: boolean;
}

const props = withDefaults(defineProps<SecurityPasswordModalProps>(), {
  tone: "accent",
  loading: false,
});

const emit = defineEmits<{
  confirm: [password: string];
}>();

const FIELD_ID = "security-confirm-current-password";
const FORGOT_PASSWORD_PATH = "/auth/forgot";

const isOpen = defineModel<boolean>("open", { default: false });
/** A password the API refused, shown under the field; typing clears it. */
const error = defineModel<string | undefined>("error");
const { t } = useI18n();
const { processApiMessage } = useTranslation();
const password = ref("");
const isSubmitted = ref(false);

const fieldError = computed(() => {
  if (error.value) return error.value;
  return isSubmitted.value && !password.value
    ? processApiMessage(REQUIRED_MESSAGE)
    : undefined;
});

watch(isOpen, (open) => {
  if (!open) return;
  password.value = "";
  isSubmitted.value = false;
  error.value = undefined;
});

watch(password, () => {
  error.value = undefined;
});

function confirm(): void {
  isSubmitted.value = true;
  if (props.loading || !password.value) return;
  emit("confirm", password.value);
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
      <SecurityPanelField
        :field-id="FIELD_ID"
        :label="t('page.settings.security.password.current')"
        :error="fieldError"
      >
        <template #default="{ describedby, invalid }">
          <DmsPasswordInput
            :id="FIELD_ID"
            v-model="password"
            has-lock-icon
            autocomplete="current-password"
            :invalid="invalid"
            :aria-describedby="describedby"
          />
        </template>
        <template #after>
          <DmsLink
            :to="FORGOT_PASSWORD_PATH"
            :class="[TEXT_LINK_CLASS, 'w-fit text-xs']"
          >
            {{ t("page.settings.security.password.forgot") }}
          </DmsLink>
        </template>
      </SecurityPanelField>
    </form>
  </SecurityDialogFrame>
</template>
