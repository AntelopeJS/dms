<script setup lang="ts">
import { TEXT_LINK_CLASS } from "#dms-ui/app/build/utils/textLink";
import { useSecurityFormat } from "../../../../composables/settings/security/useSecurityFormat";
import {
  SECURITY_ENDPOINT,
  useSecurityOverview,
} from "../../../../composables/settings/security/useSecurityOverview";
import SecurityEditPanel from "./SecurityEditPanel.vue";
import SecurityCodeModal from "./SecurityCodeModal.vue";
import SecurityPanelField from "./SecurityPanelField.vue";
import DmsPasswordInput from "#dms-ui/app/build/components/form/PasswordInput.vue";
import { resolveFieldErrors } from "#dms-core/app/composables/useFieldErrors";
import { REQUIRED_MESSAGE } from "#dms-core/app/composables/useFormValidation";
import { useFormDirty } from "#dms-ui/app/composables/unsaved-changes/useFormDirty";

const EMAIL_URL = `${SECURITY_ENDPOINT}/email`;
const CONFIRM_URL = `${EMAIL_URL}/confirm`;
const PENDING_URL = `${EMAIL_URL}/pending`;
// Refusals of the code typed in the confirmation dialog.
const CODE_ERRORS = {
  "error.invalid_token": "code",
  "error.token_expired": "code",
} as const;
// Too many wrong codes: the change is dropped and a new code must be asked.
const CODE_BURNT = "error.email_change_too_many_attempts";
const FORGOT_PASSWORD_PATH = "/auth/forgot";
const INVALID_CURRENT_PASSWORD = "error.invalid_current_password";
const EMAIL_ALREADY_USED = "error.email_already_used";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FORM_ID = "security-email-form";
const EMAIL_FIELD_ID = "security-new-email";
const CURRENT_FIELD_ID = "security-email-current-password";
// API refusals that belong to a field of the panel.
const FIELD_CODES = {
  [INVALID_CURRENT_PASSWORD]: "currentPassword",
  [EMAIL_ALREADY_USED]: "email",
} as const;

const { t } = useI18n();
const toast = useToast();
const { $authFetch } = useAuthFetch();
const { refresh: refreshSession } = useCurrentUser();
const { overview, refresh } = useSecurityOverview();
const { errorMessage, errorCode } = useSecurityFormat();
const { processApiMessage } = useTranslation();

const isEditing = ref(false);
const isSaving = ref(false);
const newEmail = ref("");
const currentPassword = ref("");
const isEmailTouched = ref(false);
const isEmailTaken = ref(false);
const isCurrentInvalid = ref(false);
const isCodeOpen = ref(false);
const isConfirming = ref(false);
const codeError = ref<string>();
// Set on submit: the empty fields say they are required.
const isSubmitted = ref(false);
// An address or a password typed and not submitted yet.
const { dirty: isDirty } = useFormDirty(
  () => ({ email: newEmail.value.trim(), password: currentPassword.value }),
  { initial: () => ({ email: "", password: "" }) },
);

const email = computed(() => overview.value?.email ?? "");
const isValidated = computed(() => overview.value?.isValidated ?? false);
const pendingEmail = computed(() => overview.value?.pendingEmail ?? null);
const hasPassword = computed(() => overview.value?.hasPassword ?? true);
const trimmedEmail = computed(() => newEmail.value.trim());
const isWellFormed = computed(() => EMAIL_PATTERN.test(trimmedEmail.value));
const isUnchanged = computed(
  () =>
    !!trimmedEmail.value &&
    trimmedEmail.value.toLowerCase() === email.value.toLowerCase(),
);
// The format is only checked once the field is left, so typing an address
// doesn't flash an error at every keystroke. Nothing shows while the panel
// collapses after a save, when the field already holds the saved address.
const emailError = computed(() => {
  if (!isEditing.value) return undefined;
  if (isSubmitted.value && !trimmedEmail.value) {
    return processApiMessage(REQUIRED_MESSAGE);
  }
  if (isEmailTouched.value && trimmedEmail.value && !isWellFormed.value) {
    return t("page.settings.security.email.invalid");
  }
  if (isUnchanged.value) {
    return t("page.settings.security.errors.email_unchanged");
  }
  if (isEmailTaken.value) {
    return t("page.settings.security.errors.email_already_used");
  }
  return undefined;
});
const currentError = computed(() => {
  if (!isEditing.value) return undefined;
  if (isCurrentInvalid.value) {
    return t("page.settings.security.errors.invalid_current_password");
  }
  return isSubmitted.value && !currentPassword.value
    ? processApiMessage(REQUIRED_MESSAGE)
    : undefined;
});

// A server-side mark goes away as soon as its field is edited.
watch(newEmail, () => {
  isEmailTaken.value = false;
});
watch(currentPassword, () => {
  isCurrentInvalid.value = false;
});

function resetForm(): void {
  newEmail.value = "";
  currentPassword.value = "";
  isEmailTouched.value = false;
  isEmailTaken.value = false;
  isCurrentInvalid.value = false;
  isSubmitted.value = false;
}

/** Shows a field-level API error under its field and focuses it. */
async function flagField(error: unknown): Promise<boolean> {
  const [refused] = resolveFieldErrors(error, {
    fields: ["email", "currentPassword"],
    codes: FIELD_CODES,
  }).fields;
  if (refused?.message === INVALID_CURRENT_PASSWORD) {
    isCurrentInvalid.value = true;
  } else if (refused?.message === EMAIL_ALREADY_USED) {
    isEmailTaken.value = true;
  } else {
    return false;
  }
  await nextTick();
  document
    .getElementById(
      refused.field === "currentPassword" ? CURRENT_FIELD_ID : EMAIL_FIELD_ID,
    )
    ?.focus();
  return true;
}

/** Focuses the first field in error, in page order. */
async function focusFirstError(): Promise<boolean> {
  const fieldId = emailError.value
    ? EMAIL_FIELD_ID
    : currentError.value
      ? CURRENT_FIELD_ID
      : undefined;
  if (!fieldId) return false;
  await nextTick();
  document.getElementById(fieldId)?.focus();
  return true;
}

async function submit(): Promise<void> {
  if (isSaving.value) return;
  isEmailTouched.value = true;
  isSubmitted.value = true;
  if (await focusFirstError()) return;
  isSaving.value = true;
  isCurrentInvalid.value = false;
  isEmailTaken.value = false;
  try {
    await $authFetch(EMAIL_URL, {
      method: "POST",
      body: {
        email: trimmedEmail.value,
        currentPassword: currentPassword.value,
      },
    });
    isEditing.value = false;
    toast.add({
      title: t("page.settings.security.email.code_sent", {
        email: trimmedEmail.value,
      }),
      color: "success",
    });
    await refresh();
    isCodeOpen.value = true;
  } catch (error) {
    if (await flagField(error)) return;
    toast.add({
      title: errorMessage(error, "page.settings.security.email.error"),
      color: "error",
    });
  } finally {
    isSaving.value = false;
  }
}

function isCodeRefusal(error: unknown): boolean {
  return (
    resolveFieldErrors(error, { fields: ["code"], codes: CODE_ERRORS }).fields
      .length > 0
  );
}

async function confirmCode(code: string): Promise<void> {
  isConfirming.value = true;
  codeError.value = undefined;
  try {
    await $authFetch(CONFIRM_URL, { method: "POST", body: { code } });
    isCodeOpen.value = false;
    toast.add({
      title: t("page.settings.security.email.updated"),
      color: "success",
    });
    await Promise.all([refresh(), refreshSession()]);
  } catch (error) {
    if (isCodeRefusal(error)) {
      codeError.value = errorMessage(
        error,
        "page.settings.two_factor.invalid_code",
      );
      return;
    }
    toast.add({
      title: errorMessage(error, "page.settings.security.email.error"),
      color: "error",
    });
    if (errorCode(error) === CODE_BURNT) {
      isCodeOpen.value = false;
      await refresh();
    }
  } finally {
    isConfirming.value = false;
  }
}

async function cancelChange(): Promise<void> {
  try {
    await $authFetch(PENDING_URL, { method: "DELETE" });
    toast.add({
      title: t("page.settings.security.email.cancelled"),
      color: "success",
    });
    await refresh();
  } catch (error) {
    toast.add({
      title: errorMessage(error, "page.settings.security.email.error"),
      color: "error",
    });
  }
}
</script>

<template>
  <DmsSection
    id="email"
    class="scroll-mt-6"
    title="$page.settings.security.email_title"
    description="$page.settings.security.email_description"
  >
    <SecurityEditPanel
      v-model:open="isEditing"
      :form-id="FORM_ID"
      :trigger-label="t('page.settings.security.email.change')"
      :trigger-disabled="!hasPassword"
      :disabled-reason="t('page.settings.security.email.needs_password')"
      :editing-label="t('page.settings.security.email.editing')"
      :submit-label="t('page.settings.security.email.submit')"
      :loading="isSaving"
      :dirty="isDirty"
      @open="resetForm"
      @submit="submit"
    >
      <template #label>
        <DmsListRow bare icon="i-ph-envelope-simple">
          <!-- A badge's height (the address line carries one) holds the
               line while the address loads. -->
          <span v-if="!email" aria-hidden="true" class="flex h-5">
            <USkeleton
              :aria-label="t('dms.a11y.loading')"
              class="my-auto h-3.5 w-40"
            />
          </span>
          <span v-else class="break-all">{{ email }}</span>
          <UBadge
            v-if="email"
            :color="isValidated ? 'success' : 'warning'"
            variant="subtle"
            size="sm"
            :icon="isValidated ? 'i-ph-seal-check' : 'i-ph-warning'"
            :label="
              isValidated
                ? t('page.settings.security.verified')
                : t('page.settings.security.not_verified')
            "
          />
          <template #meta>
            <span>{{ t("page.settings.security.email.usage") }}</span>
          </template>
        </DmsListRow>
        <DmsBanner
          v-if="pendingEmail && !isEditing"
          class="mt-3"
          size="sm"
          tone="warning"
          icon="i-ph-hourglass"
          :description="
            t('page.settings.security.email.pending', { email: pendingEmail })
          "
        >
          <template #actions>
            <UButton
              size="xs"
              variant="outline"
              color="neutral"
              :label="t('page.settings.security.email.enter_code')"
              @click="isCodeOpen = true"
            />
            <UButton
              size="xs"
              variant="ghost"
              color="neutral"
              :label="t('page.settings.security.email.cancel_change')"
              @click="cancelChange"
            />
          </template>
        </DmsBanner>
      </template>

      <SecurityPanelField
        :field-id="EMAIL_FIELD_ID"
        :label="t('page.settings.security.email.new')"
        :error="emailError"
      >
        <template #default="{ describedby, invalid }">
          <UInput
            :id="EMAIL_FIELD_ID"
            v-model="newEmail"
            type="email"
            autocomplete="email"
            icon="i-ph-envelope-simple"
            class="w-full"
            :color="invalid ? 'error' : undefined"
            :highlight="invalid"
            :aria-invalid="invalid || undefined"
            :aria-describedby="describedby"
            @blur="isEmailTouched = true"
          />
        </template>
      </SecurityPanelField>
      <SecurityPanelField
        :field-id="CURRENT_FIELD_ID"
        :label="t('page.settings.security.password.current')"
        :error="currentError"
      >
        <template #default="{ describedby, invalid }">
          <DmsPasswordInput
            has-lock-icon
            :id="CURRENT_FIELD_ID"
            v-model="currentPassword"
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
      <DmsBanner
        class="col-span-full"
        size="sm"
        tone="primary"
        icon="i-ph-info"
      >
        <template #description>
          <i18n-t
            keypath="page.settings.security.email.note"
            scope="global"
            tag="span"
          >
            <template #email>
              <b class="text-highlighted font-semibold">
                {{
                  trimmedEmail ||
                  t("page.settings.security.email.new_placeholder")
                }}
              </b>
            </template>
          </i18n-t>
        </template>
      </DmsBanner>
    </SecurityEditPanel>
    <SecurityCodeModal
      v-model:open="isCodeOpen"
      v-model:error="codeError"
      :title="t('page.settings.security.email.confirm_title')"
      :description="
        t('page.settings.security.email.confirm_description', {
          email: pendingEmail ?? '',
        })
      "
      icon="i-ph-envelope-simple"
      tone="primary"
      :code-label="t('page.settings.security.email.code_label')"
      :confirm-label="t('page.settings.security.email.confirm')"
      :loading="isConfirming"
      @confirm="confirmCode"
    />
  </DmsSection>
</template>
