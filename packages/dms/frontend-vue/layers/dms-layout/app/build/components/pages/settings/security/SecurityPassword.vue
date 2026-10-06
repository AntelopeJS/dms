<script setup lang="ts">
import { useSecurityFormat } from "../../../../../composables/settings/security/useSecurityFormat";
import {
  SECURITY_ENDPOINT,
  useSecurityOverview,
} from "../../../../../composables/settings/security/useSecurityOverview";
import SecurityEditPanel from "./SecurityEditPanel.vue";
import SecurityPanelField from "./SecurityPanelField.vue";
import DmsPasswordInput from "#dms-ui/app/build/components/form/PasswordInput.vue";
import PasswordRules from "#dms-ui/app/components/check-list/PasswordRules.vue";
import { useFormDirty } from "#dms-ui/app/composables/unsaved-changes/useFormDirty";
import { resolveFieldErrors } from "#dms-core/app/composables/useFieldErrors";
import {
  PASSWORD_RULES_MESSAGE,
  REQUIRED_MESSAGE,
} from "#dms-core/app/composables/useFormValidation";

interface PasswordChangeResponse {
  passwordChangedAt: string;
  signedOutSessions: number;
}

const PASSWORD_URL = `${SECURITY_ENDPOINT}/password`;
const FORGOT_PASSWORD_PATH = "/auth/forgot";
const INVALID_CURRENT_PASSWORD = "error.invalid_current_password";
const FORM_ID = "security-password-form";
const CURRENT_FIELD_ID = "security-current-password";
const NEW_FIELD_ID = "security-new-password";
const CONFIRM_FIELD_ID = "security-confirm-password";

const { t } = useI18n();
const toast = useToast();
const { $authFetch } = useAuthFetch();
const { processApiMessage } = useTranslation();
const { overview, refresh } = useSecurityOverview();
const { formatDate, daysSince, errorMessage } = useSecurityFormat();
const { passwordSchema } = usePasswordStrength(ref(""));

const isEditing = ref(false);
const isSaving = ref(false);
const currentPassword = ref("");
const newPassword = ref("");
const confirmPassword = ref("");
const signOutOthers = ref(true);
const isCurrentInvalid = ref(false);
// Errors show once the field was left or the form submitted, and go away
// as soon as the value is fixed.
const isSubmitted = ref(false);
// Something typed (or the sign-out choice changed) and not submitted yet.
const { dirty: isDirty } = useFormDirty(
  () => ({
    currentPassword: currentPassword.value,
    newPassword: newPassword.value,
    confirmPassword: confirmPassword.value,
    signOutOthers: signOutOthers.value,
  }),
  {
    initial: () => ({
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
      signOutOthers: true,
    }),
  },
);
const isNewTouched = ref(false);
const isConfirmTouched = ref(false);

const hasPassword = computed(() => overview.value?.hasPassword ?? true);
const otherSessions = computed(() =>
  Math.max(0, (overview.value?.activeSessions ?? 1) - 1),
);

const changedAt = computed(() => overview.value?.passwordChangedAt ?? null);
const currentError = computed(() => {
  if (isCurrentInvalid.value) {
    return t("page.settings.security.errors.invalid_current_password");
  }
  return isSubmitted.value && hasPassword.value && !currentPassword.value
    ? processApiMessage(REQUIRED_MESSAGE)
    : undefined;
});
const newError = computed(() => {
  if (!isSubmitted.value && !isNewTouched.value) return undefined;
  if (!newPassword.value) return processApiMessage(REQUIRED_MESSAGE);
  return passwordSchema.safeParse(newPassword.value).success
    ? undefined
    : processApiMessage(PASSWORD_RULES_MESSAGE);
});
const confirmError = computed(() => {
  if (!isSubmitted.value && !isConfirmTouched.value) return undefined;
  if (!confirmPassword.value) return processApiMessage(REQUIRED_MESSAGE);
  return confirmPassword.value === newPassword.value
    ? undefined
    : t("page.settings.security.password.mismatch");
});

// The "incorrect" mark goes away as soon as the password is edited.
watch(currentPassword, () => {
  isCurrentInvalid.value = false;
});

function resetForm(): void {
  currentPassword.value = "";
  newPassword.value = "";
  confirmPassword.value = "";
  signOutOthers.value = true;
  isCurrentInvalid.value = false;
  isSubmitted.value = false;
  isNewTouched.value = false;
  isConfirmTouched.value = false;
}

/** Focuses the first field in error, in page order. */
async function focusFirstError(): Promise<boolean> {
  const fieldId = [
    [currentError.value, CURRENT_FIELD_ID],
    [newError.value, NEW_FIELD_ID],
    [confirmError.value, CONFIRM_FIELD_ID],
  ].find(([message]) => !!message)?.[1];
  if (!fieldId) return false;
  await nextTick();
  document.getElementById(fieldId)?.focus();
  return true;
}

function announceSuccess(response: PasswordChangeResponse): void {
  toast.add({
    title: t("page.settings.security.password.updated"),
    description: response.signedOutSessions
      ? t(
          "page.settings.security.password.signed_out",
          { count: response.signedOutSessions },
          response.signedOutSessions,
        )
      : undefined,
    color: "success",
  });
}

async function submit(): Promise<void> {
  if (isSaving.value) return;
  isSubmitted.value = true;
  isCurrentInvalid.value = false;
  if (await focusFirstError()) return;
  isSaving.value = true;
  isCurrentInvalid.value = false;
  try {
    const response = await $authFetch<PasswordChangeResponse>(PASSWORD_URL, {
      method: "POST",
      body: {
        currentPassword: hasPassword.value ? currentPassword.value : undefined,
        password: newPassword.value,
        signOutOtherSessions: otherSessions.value > 0 && signOutOthers.value,
      },
    });
    announceSuccess(response);
    isEditing.value = false;
    await refresh();
  } catch (error) {
    // A wrong current password is shown under its field; anything else
    // (rate limit, server error) goes to a toast.
    const isCurrentRefused =
      resolveFieldErrors(error, {
        fields: ["currentPassword"],
        codes: { [INVALID_CURRENT_PASSWORD]: "currentPassword" },
      }).fields.length > 0;
    if (isCurrentRefused) {
      isCurrentInvalid.value = true;
      await nextTick();
      document.getElementById(CURRENT_FIELD_ID)?.focus();
      return;
    }
    toast.add({
      title: errorMessage(error, "page.settings.security.password.error"),
      color: "error",
    });
  } finally {
    isSaving.value = false;
  }
}
</script>

<template>
  <DmsSection
    id="password"
    class="scroll-mt-6"
    title="$page.settings.security.password_title"
    description="$page.settings.security.password_description"
  >
    <SecurityEditPanel
      v-model:open="isEditing"
      :form-id="FORM_ID"
      :trigger-label="
        hasPassword
          ? t('page.settings.security.password.change')
          : t('page.settings.security.password.set')
      "
      :editing-label="t('page.settings.security.password.editing')"
      :submit-label="t('page.settings.security.password.submit')"
      :loading="isSaving"
      :dirty="isDirty"
      @open="resetForm"
      @submit="submit"
    >
      <template #label>
        <DmsListRow bare icon="i-ph-password">
          {{ t("page.settings.security.password.label") }}
          <template #meta>
            <span v-if="!overview" aria-hidden="true" class="flex h-[1lh]">
              <USkeleton class="my-auto h-2.5 w-52" />
            </span>
            <template v-else-if="!hasPassword">
              <span>{{ t("page.settings.security.password.not_set") }}</span>
            </template>
            <template v-else-if="changedAt">
              <span>
                {{
                  t("page.settings.security.password.last_changed", {
                    date: formatDate(changedAt),
                  })
                }}
              </span>
              <span class="tabular-nums">
                {{
                  t(
                    "page.settings.security.changed_days_ago",
                    { count: daysSince(changedAt) },
                    daysSince(changedAt),
                  )
                }}
              </span>
            </template>
            <span v-else>
              {{ t("page.settings.security.password.never_changed") }}
            </span>
          </template>
        </DmsListRow>
      </template>

      <SecurityPanelField
        v-if="hasPassword"
        :field-id="CURRENT_FIELD_ID"
        :label="t('page.settings.security.password.current')"
        :error="currentError"
        alone
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
            class="text-primary w-fit text-xs font-medium hover:underline hover:underline-offset-3"
          >
            {{ t("page.settings.security.password.forgot") }}
          </DmsLink>
        </template>
      </SecurityPanelField>
      <SecurityPanelField
        :field-id="NEW_FIELD_ID"
        :label="t('page.settings.security.password.new')"
        :error="newError"
      >
        <template #default="{ describedby, invalid }">
          <DmsPasswordInput
            has-lock-icon
            :id="NEW_FIELD_ID"
            v-model="newPassword"
            autocomplete="new-password"
            :invalid="invalid"
            :aria-describedby="describedby"
            @blur="isNewTouched = true"
          />
        </template>
      </SecurityPanelField>
      <SecurityPanelField
        :field-id="CONFIRM_FIELD_ID"
        :label="t('page.settings.security.password.confirm')"
        :error="confirmError"
      >
        <template #default="{ describedby, invalid }">
          <DmsPasswordInput
            has-lock-icon
            :id="CONFIRM_FIELD_ID"
            v-model="confirmPassword"
            @blur="isConfirmTouched = true"
            autocomplete="new-password"
            :placeholder="
              t('page.settings.security.password.confirm_placeholder')
            "
            :invalid="invalid"
            :aria-describedby="describedby"
          />
        </template>
      </SecurityPanelField>
      <PasswordRules
        class="col-span-full"
        variant="summary"
        :password="newPassword"
      >
        <template #head="{ met, total }">
          {{ t("page.settings.security.password.rules_head", { met, total }) }}
        </template>
      </PasswordRules>

      <template #footer>
        <UCheckbox
          v-if="otherSessions > 0"
          v-model="signOutOthers"
          :label="t('page.settings.security.password.sign_out_others')"
          :description="
            t(
              'page.settings.security.password.sign_out_others_hint',
              { count: otherSessions },
              otherSessions,
            )
          "
        />
      </template>
    </SecurityEditPanel>
  </DmsSection>
</template>
