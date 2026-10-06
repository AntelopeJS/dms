<script setup lang="ts">
import type { DropdownMenuItem } from "@nuxt/ui";
import type { Ref } from "vue";
import { useSecurityFormat } from "../../../../../composables/settings/security/useSecurityFormat";
import {
  SECURITY_ENDPOINT,
  type TotpSetup,
  useSecurityOverview,
} from "../../../../../composables/settings/security/useSecurityOverview";
import { useRevealedBackupCodes } from "../../../../../composables/settings/security/useRevealedBackupCodes";
import SecurityBackupCodesModal from "./SecurityBackupCodesModal.vue";
import SecurityCodeModal from "./SecurityCodeModal.vue";
import SecurityTotpSetupModal from "./SecurityTotpSetupModal.vue";
import { resolveFieldErrors } from "#dms-core/app/composables/useFieldErrors";

type TwoFactorMethod = "totp" | "email";

interface MethodConfig {
  key: TwoFactorMethod;
  icon: string;
  nameKey: string;
  metaKey: string;
  codeLabelKey: string;
}

interface MethodEnabledResponse {
  backupCodes?: string[];
}

interface BackupCodesResponse {
  backupCodes: string[];
}

const TWO_FACTOR_URL = `${SECURITY_ENDPOINT}/two-factor`;
const INVALID_CODE_KEY = "page.settings.two_factor.invalid_code";
// Refusals of the typed code: shown under the code, in its dialog.
const CODE_ERRORS = {
  "error.invalid_2fa_code": "code",
  "error.2fa_code_expired": "code",
} as const;
// Opening a dialog while the previous one is still leaving nests them, and the
// leaving one stays on top until the new one closes: let it finish first.
const DIALOG_SWAP_MS = 300;
const METHODS: MethodConfig[] = [
  {
    key: "totp",
    icon: "i-ph-device-mobile",
    nameKey: "page.settings.two_factor.totp_title",
    metaKey: "page.settings.security.two_factor.totp_meta",
    codeLabelKey: "page.settings.security.two_factor.code_label_totp",
  },
  {
    key: "email",
    icon: "i-ph-envelope-simple",
    nameKey: "page.settings.two_factor.email_title",
    metaKey: "page.settings.security.two_factor.email_meta",
    codeLabelKey: "page.settings.security.two_factor.code_label_email",
  },
];

const { t } = useI18n();
const toast = useToast();
const { $authFetch } = useAuthFetch();
const { overview, attention, refresh } = useSecurityOverview();
const { formatDate, errorMessage } = useSecurityFormat();

const isProcessing = ref(false);
const isTotpOpen = ref(false);
const totpSetup = ref<TotpSetup | null>(null);
const { user } = useUserSession<User>();
const {
  codes,
  isRegenerated,
  isOpen: isCodesOpen,
  reveal: revealCodes,
} = useRevealedBackupCodes(computed(() => user.value?._id));
const isRemoveOpen = ref(false);
const totpCodeError = ref<string>();
const removeCodeError = ref<string>();
const regenerateCodeError = ref<string>();
const removingMethod = ref<MethodConfig | null>(null);
const isRegenerateOpen = ref(false);

const status = computed(() => overview.value?.twoFactor ?? null);
const email = computed(() => overview.value?.email ?? "");
const enabledMethods = computed(() =>
  METHODS.filter((method) => status.value?.methods.includes(method.key)),
);
const addableMethods = computed(() =>
  METHODS.filter((method) => !status.value?.methods.includes(method.key)),
);
const isOn = computed(() => enabledMethods.value.length > 0);
const isUnsaved = computed(() =>
  attention.value.includes("backup_codes_unsaved"),
);
const isLow = computed(() => attention.value.includes("backup_codes_low"));

const addItems = computed<DropdownMenuItem[]>(() =>
  addableMethods.value.map((method) => ({
    label: t(method.nameKey),
    icon: method.icon,
    onSelect: () => void addMethod(method.key),
  })),
);

const regenerateCodeLabel = computed(() => {
  const [only, ...others] = enabledMethods.value;
  return only && !others.length
    ? t(only.codeLabelKey)
    : t("page.settings.security.two_factor.code_label_any");
});

const removeDescription = computed(() => {
  const remaining = enabledMethods.value.find(
    (method) => method.key !== removingMethod.value?.key,
  );
  return remaining
    ? t("page.settings.security.two_factor.remove_keeps_on", {
        method: t(remaining.nameKey),
      })
    : t("page.settings.security.two_factor.remove_turns_off");
});

function fail(error: unknown, fallbackKey: string): void {
  toast.add({ title: errorMessage(error, fallbackKey), color: "error" });
}

function showCodes(
  backupCodes: string[] | undefined,
  regenerated = false,
): void {
  if (!backupCodes?.length) return;
  revealCodes(backupCodes, regenerated);
  setTimeout(() => (isCodesOpen.value = true), DIALOG_SWAP_MS);
}

/** Whether the API refused the typed code itself (not the request). */
function isCodeError(error: unknown): boolean {
  return (
    resolveFieldErrors(error, { fields: ["code"], codes: CODE_ERRORS }).fields
      .length > 0
  );
}

/**
 * @param codeError Where a refused code shows (under the code of the open
 *   dialog) instead of a toast
 */
async function run(
  action: () => Promise<void>,
  fallbackKey: string,
  codeError?: Ref<string | undefined>,
): Promise<void> {
  isProcessing.value = true;
  if (codeError) codeError.value = undefined;
  try {
    await action();
    await refresh();
  } catch (error) {
    if (codeError && isCodeError(error)) {
      codeError.value = errorMessage(error, INVALID_CODE_KEY);
    } else {
      fail(error, fallbackKey);
    }
  } finally {
    isProcessing.value = false;
  }
}

async function startTotp(): Promise<void> {
  await run(async () => {
    totpSetup.value = await $authFetch<TotpSetup>(
      `${TWO_FACTOR_URL}/enable-totp`,
      {
        method: "POST",
      },
    );
    isTotpOpen.value = true;
  }, "page.settings.two_factor.setup_error");
}

async function confirmTotp(code: string): Promise<void> {
  await run(
    async () => {
      const response = await $authFetch<MethodEnabledResponse>(
        `${TWO_FACTOR_URL}/confirm-totp`,
        { method: "POST", body: { code } },
      );
      isTotpOpen.value = false;
      toast.add({
        title: t("page.settings.two_factor.enable_success"),
        color: "success",
      });
      showCodes(response.backupCodes);
    },
    INVALID_CODE_KEY,
    totpCodeError,
  );
}

async function enableEmail(): Promise<void> {
  await run(async () => {
    const response = await $authFetch<MethodEnabledResponse>(
      `${TWO_FACTOR_URL}/enable-email`,
      { method: "POST" },
    );
    toast.add({
      title: t("page.settings.two_factor.enable_success"),
      color: "success",
    });
    showCodes(response.backupCodes);
  }, "page.settings.two_factor.setup_error");
}

const ADD_HANDLERS: Record<TwoFactorMethod, () => Promise<void>> = {
  totp: startTotp,
  email: enableEmail,
};

async function addMethod(method: TwoFactorMethod): Promise<void> {
  await ADD_HANDLERS[method]();
}

function openRemove(method: MethodConfig): void {
  removingMethod.value = method;
  isRemoveOpen.value = true;
}

async function confirmRemove(code: string): Promise<void> {
  const method = removingMethod.value;
  if (!method) return;
  await run(
    async () => {
      await $authFetch(`${TWO_FACTOR_URL}/disable`, {
        method: "POST",
        body: { method: method.key, code },
      });
      isRemoveOpen.value = false;
      toast.add({
        title: t("page.settings.two_factor.disable_success"),
        color: "success",
      });
    },
    INVALID_CODE_KEY,
    removeCodeError,
  );
}

async function sendEmailCode(): Promise<void> {
  try {
    await $authFetch(`${TWO_FACTOR_URL}/request-email-code`, {
      method: "POST",
    });
    toast.add({
      title: t("page.settings.two_factor.email_code_sent"),
      color: "success",
    });
  } catch (error) {
    fail(error, "page.settings.two_factor.email_code_error");
  }
}

async function confirmRegenerate(code: string): Promise<void> {
  await run(
    async () => {
      const response = await $authFetch<BackupCodesResponse>(
        `${TWO_FACTOR_URL}/regenerate-backup`,
        { method: "POST", body: { code } },
      );
      isRegenerateOpen.value = false;
      showCodes(response.backupCodes, true);
    },
    INVALID_CODE_KEY,
    regenerateCodeError,
  );
}

async function markSaved(): Promise<void> {
  if (!isUnsaved.value) return;
  try {
    await $authFetch(`${TWO_FACTOR_URL}/backup-codes-saved`, {
      method: "POST",
    });
    await refresh();
  } catch (error) {
    fail(error, "page.settings.security.backup.save_error");
  }
}
</script>

<template>
  <DmsSection
    id="two-factor"
    class="scroll-mt-6"
    title="$page.settings.two_factor.title"
    description="$page.settings.two_factor.description"
  >
    <template #badge>
      <USkeleton
        v-if="!status"
        aria-hidden="true"
        class="h-5 w-12 rounded-full"
      />
      <DmsStatusPill
        v-else
        :tone="isOn ? 'success' : 'neutral'"
        :label="
          isOn
            ? t('page.settings.security.on')
            : t('page.settings.security.off')
        "
        size="sm"
      />
    </template>

    <!-- One row built like the loaded ones (a title and its meta line). -->
    <DmsFieldRow v-if="!status" aria-hidden="true">
      <template #label>
        <DmsListRow bare>
          <span class="flex h-[1lh]">
            <USkeleton class="my-auto h-3 w-36" />
          </span>
          <template #meta>
            <span class="flex h-[1lh]">
              <USkeleton class="my-auto h-2.5 w-64 max-w-full" />
            </span>
          </template>
        </DmsListRow>
      </template>
    </DmsFieldRow>

    <template v-else>
      <DmsFieldRow v-for="method in enabledMethods" :key="method.key">
        <template #label>
          <DmsListRow bare :icon="method.icon" tone="accent">
            {{ t(method.nameKey) }}
            <template #meta>
              <span>{{ t(method.metaKey, { email }) }}</span>
            </template>
          </DmsListRow>
        </template>
        <UButton
          color="neutral"
          variant="ghost"
          size="sm"
          :label="t('page.settings.security.two_factor.remove')"
          @click="openRemove(method)"
        />
      </DmsFieldRow>

      <DmsFieldRow v-if="!isOn">
        <template #label>
          <DmsListRow bare icon="i-ph-shield-warning" tone="warning">
            {{ t("page.settings.security.two_factor.off_title") }}
            <template #meta>
              <span>{{ t("page.settings.security.two_factor.off_meta") }}</span>
            </template>
          </DmsListRow>
        </template>
      </DmsFieldRow>

      <DmsFieldRow v-if="isOn" id="backup-codes" class="scroll-mt-6">
        <template #label>
          <DmsListRow
            bare
            icon="i-ph-key"
            :tone="isUnsaved || isLow ? 'warning' : 'muted'"
          >
            {{ t("page.settings.security.backup.title") }}
            <UBadge
              v-if="isUnsaved || isLow"
              color="warning"
              variant="subtle"
              size="sm"
              icon="i-ph-warning"
              :label="
                isUnsaved
                  ? t('page.settings.security.backup.not_saved')
                  : t('page.settings.security.backup.running_low')
              "
            />
            <template #meta>
              <span>
                <i18n-t
                  keypath="page.settings.security.codes_left_rich"
                  scope="global"
                  tag="span"
                >
                  <template #left>
                    <b class="text-highlighted tabular-nums">
                      {{ status.backupCodesLeft }}
                    </b>
                  </template>
                  <template #total>
                    <span class="tabular-nums">
                      {{ status.backupCodesTotal }}
                    </span>
                  </template>
                </i18n-t>
              </span>
              <span v-if="status.backupCodesGeneratedAt">
                {{
                  t("page.settings.security.backup.generated", {
                    date: formatDate(status.backupCodesGeneratedAt),
                  })
                }}
              </span>
              <span>{{ t("page.settings.security.backup.usage") }}</span>
            </template>
          </DmsListRow>
        </template>
        <UButton
          color="neutral"
          variant="ghost"
          size="sm"
          icon="i-ph-arrows-clockwise"
          :label="t('page.settings.security.backup.regenerate')"
          @click="isRegenerateOpen = true"
        />
      </DmsFieldRow>
    </template>

    <template v-if="!status" #footer>
      <USkeleton aria-hidden="true" class="h-3 w-56" />
      <USkeleton aria-hidden="true" class="ms-auto h-7 w-36" />
    </template>
    <template v-else #footer>
      <span class="flex items-center gap-1.5 text-xs">
        <UIcon name="i-ph-info" class="text-dimmed size-3.5" />
        {{ t("page.settings.security.two_factor.keep_two") }}
      </span>
      <div v-if="addableMethods.length" class="ms-auto">
        <UDropdownMenu v-if="addableMethods.length > 1" :items="addItems">
          <UButton
            color="neutral"
            variant="outline"
            size="sm"
            icon="i-ph-plus"
            :loading="isProcessing"
            :label="t('page.settings.security.two_factor.add_method')"
          />
        </UDropdownMenu>
        <UButton
          v-else
          color="neutral"
          variant="outline"
          size="sm"
          icon="i-ph-plus"
          :loading="isProcessing"
          :label="
            t('page.settings.security.two_factor.add_named', {
              method: t(addableMethods[0]!.nameKey),
            })
          "
          @click="addMethod(addableMethods[0]!.key)"
        />
      </div>
    </template>

    <SecurityTotpSetupModal
      v-model:open="isTotpOpen"
      v-model:error="totpCodeError"
      :setup="totpSetup"
      :account="email"
      :loading="isProcessing"
      @confirm="confirmTotp"
    />
    <SecurityBackupCodesModal
      v-model:open="isCodesOpen"
      :codes="codes"
      :account="email"
      :is-regenerated="isRegenerated"
      @saved="markSaved"
    />
    <SecurityCodeModal
      v-model:open="isRemoveOpen"
      v-model:error="removeCodeError"
      :title="
        t('page.settings.security.two_factor.remove_title', {
          method: removingMethod ? t(removingMethod.nameKey) : '',
        })
      "
      :description="removeDescription"
      icon="i-ph-shield-warning"
      tone="error"
      :code-label="removingMethod ? t(removingMethod.codeLabelKey) : ''"
      :confirm-label="t('page.settings.security.two_factor.remove_confirm')"
      :loading="isProcessing"
      :can-send-email-code="removingMethod?.key === 'email'"
      @confirm="confirmRemove"
      @send-code="sendEmailCode"
    />
    <SecurityCodeModal
      v-model:open="isRegenerateOpen"
      v-model:error="regenerateCodeError"
      :title="t('page.settings.security.backup.regenerate_title')"
      :description="t('page.settings.two_factor.regenerate_description')"
      icon="i-ph-arrows-clockwise"
      tone="warning"
      :code-label="regenerateCodeLabel"
      :confirm-label="t('page.settings.security.backup.regenerate_confirm')"
      :loading="isProcessing"
      :can-send-email-code="status?.methods.includes('email')"
      @confirm="confirmRegenerate"
      @send-code="sendEmailCode"
    />
  </DmsSection>
</template>
