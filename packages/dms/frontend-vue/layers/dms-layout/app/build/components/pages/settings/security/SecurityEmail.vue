<script setup lang="ts">
import { useSecurityFormat } from "../../../../../composables/settings/security/useSecurityFormat";
import {
  SECURITY_ENDPOINT,
  useSecurityOverview,
} from "../../../../../composables/settings/security/useSecurityOverview";
import SecurityPasswordInput from "./SecurityPasswordInput.vue";

const EMAIL_URL = `${SECURITY_ENDPOINT}/email`;
const INVALID_CURRENT_PASSWORD = "error.invalid_current_password";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const { t } = useI18n();
const toast = useToast();
const { $authFetch } = useAuthFetch();
const { refresh: refreshSession } = useCurrentUser();
const { overview, refresh } = useSecurityOverview();
const { errorMessage, errorCode } = useSecurityFormat();

const isOpen = ref(false);
const isSaving = ref(false);
const newEmail = ref("");
const currentPassword = ref("");
const isCurrentInvalid = ref(false);

const email = computed(() => overview.value?.email ?? "");
const isValidated = computed(() => overview.value?.isValidated ?? false);
const hasPassword = computed(() => overview.value?.hasPassword ?? true);
const trimmedEmail = computed(() => newEmail.value.trim());
const canSubmit = computed(
  () =>
    EMAIL_PATTERN.test(trimmedEmail.value) &&
    trimmedEmail.value.toLowerCase() !== email.value &&
    !!currentPassword.value,
);

function open(): void {
  newEmail.value = "";
  currentPassword.value = "";
  isCurrentInvalid.value = false;
  isOpen.value = true;
}

async function submit(): Promise<void> {
  if (!canSubmit.value) return;
  isSaving.value = true;
  isCurrentInvalid.value = false;
  try {
    await $authFetch(EMAIL_URL, {
      method: "POST",
      body: {
        email: trimmedEmail.value,
        currentPassword: currentPassword.value,
      },
    });
    isOpen.value = false;
    toast.add({
      title: t("page.settings.security.email.updated"),
      color: "success",
    });
    await Promise.all([refresh(), refreshSession()]);
  } catch (error) {
    isCurrentInvalid.value = errorCode(error) === INVALID_CURRENT_PASSWORD;
    toast.add({
      title: errorMessage(error, "page.settings.security.email.error"),
      color: "error",
    });
  } finally {
    isSaving.value = false;
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
    <DmsFieldRow>
      <template #label>
        <DmsListRow bare icon="i-ph-envelope-simple">
          <USkeleton v-if="!email" class="h-4 w-40" />
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
      </template>
      <UTooltip
        :text="t('page.settings.security.email.needs_password')"
        :disabled="hasPassword"
      >
        <UButton
          color="neutral"
          variant="outline"
          size="sm"
          icon="i-ph-pencil-simple"
          :label="t('page.settings.security.email.change')"
          :disabled="!hasPassword"
          @click="open"
        />
      </UTooltip>
    </DmsFieldRow>

    <UModal
      v-model:open="isOpen"
      :title="t('page.settings.security.email.modal_title')"
    >
      <template #description>
        <i18n-t
          keypath="page.settings.security.email.modal_description"
          scope="global"
          tag="span"
        >
          <template #email>
            <b class="text-highlighted font-semibold">{{ email }}</b>
          </template>
        </i18n-t>
      </template>
      <template #body>
        <form
          id="security-email-form"
          class="grid gap-4"
          @submit.prevent="submit"
        >
          <UFormField :label="t('page.settings.security.email.new')">
            <UInput
              v-model="newEmail"
              type="email"
              autocomplete="email"
              icon="i-ph-envelope-simple"
              class="w-full"
            />
          </UFormField>
          <UFormField :label="t('page.settings.security.password.current')">
            <SecurityPasswordInput
              v-model="currentPassword"
              autocomplete="current-password"
              :invalid="isCurrentInvalid"
            />
          </UFormField>
          <div
            class="text-muted flex items-start gap-2 rounded-md border border-(--dms-accent-line) bg-(--dms-accent-tint) px-3 py-2.5 text-[12.5px] leading-normal"
          >
            <UIcon
              name="i-ph-info"
              class="mt-px size-[15px] shrink-0 text-(--dms-accent)"
            />
            <i18n-t
              keypath="page.settings.security.email.modal_note"
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
          </div>
        </form>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            color="neutral"
            variant="outline"
            :label="t('page.settings.security.cancel')"
            @click="isOpen = false"
          />
          <UButton
            type="submit"
            form="security-email-form"
            icon="i-ph-check"
            :loading="isSaving"
            :disabled="!canSubmit"
            :label="t('page.settings.security.email.submit')"
          />
        </div>
      </template>
    </UModal>
  </DmsSection>
</template>
