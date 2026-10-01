<script setup lang="ts">
import { useSecurityFormat } from "../../../../../composables/settings/security/useSecurityFormat";
import {
  SECURITY_ENDPOINT,
  useSecurityOverview,
} from "../../../../../composables/settings/security/useSecurityOverview";
import SecurityPasswordInput from "./SecurityPasswordInput.vue";
import PasswordRules from "#dms-ui/app/components/check-list/PasswordRules.vue";

interface PasswordChangeResponse {
  passwordChangedAt: string;
  signedOutSessions: number;
}

const PASSWORD_URL = `${SECURITY_ENDPOINT}/password`;
const FORGOT_PASSWORD_PATH = "/auth/forgot";
const INVALID_CURRENT_PASSWORD = "error.invalid_current_password";
const FORM_ID = "security-password-form";

const { t } = useI18n();
const toast = useToast();
const { $authFetch } = useAuthFetch();
const { overview, refresh } = useSecurityOverview();
const { formatDate, daysSince, errorMessage, errorCode } = useSecurityFormat();
const { passwordSchema } = usePasswordStrength(ref(""));

const isEditing = ref(false);
const isSaving = ref(false);
const currentPassword = ref("");
const newPassword = ref("");
const confirmPassword = ref("");
const signOutOthers = ref(true);
const isCurrentInvalid = ref(false);

const hasPassword = computed(() => overview.value?.hasPassword ?? true);
const otherSessions = computed(() =>
  Math.max(0, (overview.value?.activeSessions ?? 1) - 1),
);
const isMismatch = computed(
  () => !!confirmPassword.value && confirmPassword.value !== newPassword.value,
);
const canSubmit = computed(
  () =>
    (!hasPassword.value || !!currentPassword.value) &&
    passwordSchema.safeParse(newPassword.value).success &&
    confirmPassword.value === newPassword.value,
);

const changedAt = computed(() => overview.value?.passwordChangedAt ?? null);

function resetForm(): void {
  currentPassword.value = "";
  newPassword.value = "";
  confirmPassword.value = "";
  signOutOthers.value = true;
  isCurrentInvalid.value = false;
}

function cancel(): void {
  resetForm();
  isEditing.value = false;
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
  if (!canSubmit.value) return;
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
    cancel();
    await refresh();
  } catch (error) {
    isCurrentInvalid.value = errorCode(error) === INVALID_CURRENT_PASSWORD;
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
    <DmsFieldRow>
      <template #label>
        <DmsListRow bare icon="i-ph-password">
          {{ t("page.settings.security.password.label") }}
          <template #meta>
            <template v-if="!hasPassword">
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
      <span v-if="isEditing" class="text-muted text-xs">
        {{ t("page.settings.security.password.editing") }}
      </span>
      <UButton
        v-else
        color="neutral"
        variant="outline"
        size="sm"
        icon="i-ph-pencil-simple"
        :label="
          hasPassword
            ? t('page.settings.security.password.change')
            : t('page.settings.security.password.set')
        "
        @click="isEditing = true"
      />
    </DmsFieldRow>

    <form
      v-if="isEditing"
      :id="FORM_ID"
      class="border-muted grid grid-cols-2 gap-x-5 gap-y-4 border-t p-[18px] max-sm:grid-cols-1"
      @submit.prevent="submit"
    >
      <div
        v-if="hasPassword"
        class="col-span-full grid max-w-[calc(50%-10px)] gap-1.5 max-sm:max-w-none"
      >
        <label
          for="security-current-password"
          class="text-highlighted text-[13px] font-medium"
        >
          {{ t("page.settings.security.password.current") }}
        </label>
        <SecurityPasswordInput
          id="security-current-password"
          v-model="currentPassword"
          autocomplete="current-password"
          :invalid="isCurrentInvalid"
        />
        <DmsLink
          :to="FORGOT_PASSWORD_PATH"
          class="text-primary w-fit text-xs font-medium hover:underline hover:underline-offset-3"
        >
          {{ t("page.settings.security.password.forgot") }}
        </DmsLink>
      </div>
      <div class="grid content-start gap-1.5">
        <label
          for="security-new-password"
          class="text-highlighted text-[13px] font-medium"
        >
          {{ t("page.settings.security.password.new") }}
        </label>
        <SecurityPasswordInput
          id="security-new-password"
          v-model="newPassword"
          autocomplete="new-password"
        />
      </div>
      <div class="grid content-start gap-1.5">
        <label
          for="security-confirm-password"
          class="text-highlighted text-[13px] font-medium"
        >
          {{ t("page.settings.security.password.confirm") }}
        </label>
        <SecurityPasswordInput
          id="security-confirm-password"
          v-model="confirmPassword"
          autocomplete="new-password"
          :placeholder="
            t('page.settings.security.password.confirm_placeholder')
          "
          :invalid="isMismatch"
        />
        <span v-if="isMismatch" class="text-error text-xs">
          {{ t("page.settings.security.password.mismatch") }}
        </span>
      </div>
      <PasswordRules
        class="col-span-full"
        variant="summary"
        :password="newPassword"
      >
        <template #head="{ met, total }">
          {{ t("page.settings.security.password.rules_head", { met, total }) }}
        </template>
      </PasswordRules>
      <div class="col-span-full flex flex-wrap items-center gap-2.5">
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
        <div class="ms-auto flex items-center gap-2">
          <UButton
            color="neutral"
            variant="ghost"
            :label="t('page.settings.security.cancel')"
            @click="cancel"
          />
          <UButton
            type="submit"
            :loading="isSaving"
            :disabled="!canSubmit"
            :label="t('page.settings.security.password.submit')"
          />
        </div>
      </div>
    </form>
  </DmsSection>
</template>
