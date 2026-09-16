<script setup lang="ts">
interface TwoFactorStatus {
  methods: string[];
  hasBackupCodes: boolean;
}

interface TotpSetupResponse {
  secret: string;
  otpAuthUrl: string;
}

interface BackupCodesResponse {
  backupCodes: string[];
}

interface MethodConfig {
  key: string;
  label: string;
}

const QR_CODE_API_BASE =
  "https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=";

const AVAILABLE_METHODS: MethodConfig[] = [
  { key: "totp", label: "page.settings.two_factor.totp_title" },
  { key: "email", label: "page.settings.two_factor.email_title" },
];

const { $authFetch } = useAuthFetch();
const toast = useToast();
const { t } = useI18n();

const isLoading = ref(true);
const status = ref<TwoFactorStatus>({ methods: [], hasBackupCodes: false });
const isProcessing = ref(false);

const isAddMethodOpen = ref(false);

const isTotpSetupOpen = ref(false);
const totpSetup = ref<TotpSetupResponse | null>(null);
const totpVerifyCode = ref("");

const isDisableOpen = ref(false);
const disablingMethod = ref<string>("");
const disableCode = ref("");

const isBackupCodesOpen = ref(false);
const backupCodes = ref<string[]>([]);

const isRegenerateOpen = ref(false);
const regenerateCode = ref("");

const hasAnyMethod = computed(() => status.value.methods.length > 0);

const enabledMethods = computed(() =>
  AVAILABLE_METHODS.filter((m) => status.value.methods.includes(m.key)),
);

const addableMethods = computed(() =>
  AVAILABLE_METHODS.filter((m) => !status.value.methods.includes(m.key)),
);

async function fetchStatus() {
  status.value = await $authFetch<TwoFactorStatus>(
    "/settings/user/profile/two-factor",
  );
}

const METHOD_HANDLERS: Record<string, () => Promise<void>> = {
  totp: () => startTotpSetup(),
  email: () => enableEmail(),
};

async function addMethod(method: string) {
  isAddMethodOpen.value = false;
  const handler = METHOD_HANDLERS[method];
  if (handler) {
    await handler();
  }
}

async function startTotpSetup() {
  isProcessing.value = true;
  try {
    totpSetup.value = await $authFetch<TotpSetupResponse>(
      "/settings/user/profile/two-factor/enable-totp",
      { method: "POST" },
    );
    totpVerifyCode.value = "";
    isTotpSetupOpen.value = true;
  } catch {
    toast.add({
      title: t("page.settings.two_factor.setup_error"),
      color: "error",
    });
  } finally {
    isProcessing.value = false;
  }
}

async function confirmTotp() {
  isProcessing.value = true;
  try {
    const response = await $authFetch<{
      success: boolean;
      backupCodes?: string[];
    }>("/settings/user/profile/two-factor/confirm-totp", {
      method: "POST",
      body: { code: totpVerifyCode.value },
    });

    isTotpSetupOpen.value = false;
    toast.add({
      title: t("page.settings.two_factor.enable_success"),
      color: "success",
    });

    if (response.backupCodes) {
      backupCodes.value = response.backupCodes;
      isBackupCodesOpen.value = true;
    }

    await fetchStatus();
  } catch {
    toast.add({
      title: t("page.settings.two_factor.invalid_code"),
      color: "error",
    });
  } finally {
    isProcessing.value = false;
  }
}

async function enableEmail() {
  isProcessing.value = true;
  try {
    const response = await $authFetch<{
      success: boolean;
      backupCodes?: string[];
    }>("/settings/user/profile/two-factor/enable-email", {
      method: "POST",
    });

    toast.add({
      title: t("page.settings.two_factor.enable_success"),
      color: "success",
    });

    if (response.backupCodes) {
      backupCodes.value = response.backupCodes;
      isBackupCodesOpen.value = true;
    }

    await fetchStatus();
  } catch {
    toast.add({
      title: t("page.settings.two_factor.setup_error"),
      color: "error",
    });
  } finally {
    isProcessing.value = false;
  }
}

function openDisableModal(method: string) {
  disablingMethod.value = method;
  disableCode.value = "";
  isDisableOpen.value = true;
}

async function confirmDisable() {
  if (!disableCode.value) return;
  isProcessing.value = true;
  try {
    await $authFetch("/settings/user/profile/two-factor/disable", {
      method: "POST",
      body: { method: disablingMethod.value, code: disableCode.value },
    });

    isDisableOpen.value = false;
    toast.add({
      title: t("page.settings.two_factor.disable_success"),
      color: "success",
    });
    await fetchStatus();
  } catch {
    toast.add({
      title: t("page.settings.two_factor.invalid_code"),
      color: "error",
    });
  } finally {
    isProcessing.value = false;
  }
}

async function requestDisableEmailCode() {
  try {
    await $authFetch("/settings/user/profile/two-factor/request-email-code", {
      method: "POST",
    });
    toast.add({
      title: t("page.settings.two_factor.email_code_sent"),
      color: "success",
    });
  } catch {
    toast.add({
      title: t("page.settings.two_factor.email_code_error"),
      color: "error",
    });
  }
}

function openRegenerateModal() {
  regenerateCode.value = "";
  isRegenerateOpen.value = true;
}

async function confirmRegenerate() {
  if (!regenerateCode.value) return;
  isProcessing.value = true;
  try {
    const response = await $authFetch<BackupCodesResponse>(
      "/settings/user/profile/two-factor/regenerate-backup",
      { method: "POST", body: { code: regenerateCode.value } },
    );

    isRegenerateOpen.value = false;
    backupCodes.value = response.backupCodes;
    isBackupCodesOpen.value = true;
    await fetchStatus();
    toast.add({
      title: t("page.settings.two_factor.backup_regenerated"),
      color: "success",
    });
  } catch {
    toast.add({
      title: t("page.settings.two_factor.invalid_code"),
      color: "error",
    });
  } finally {
    isProcessing.value = false;
  }
}

onMounted(async () => {
  try {
    await fetchStatus();
  } finally {
    isLoading.value = false;
  }
});
</script>

<template>
  <DmsCard class="my-5">
    <div v-if="isLoading" class="space-y-4">
      <USkeleton class="h-16 w-full rounded-lg" />
    </div>

    <div
      v-else
      class="grid grid-cols-1 gap-6 sm:grid-cols-[min(40%,--spacing(80))_1fr]"
    >
      <div class="space-y-1">
        <h3 class="text-highlighted text-base font-semibold sm:text-sm">
          {{ $t("page.settings.two_factor.title") }}
        </h3>
        <p class="text-dimmed text-sm sm:text-xs">
          {{ $t("page.settings.two_factor.description") }}
        </p>
      </div>

      <div class="space-y-3">
        <div
          v-for="method in enabledMethods"
          :key="method.key"
          class="flex items-center justify-between"
        >
          <div class="flex items-center gap-2">
            <UIcon name="i-ph-check-circle-fill" class="size-5" />
            <span class="text-highlighted text-sm">
              {{ $t(method.label) }}
            </span>
          </div>
          <UButton
            variant="ghost"
            color="neutral"
            size="sm"
            trailing-icon="i-ph-trash"
            @click="openDisableModal(method.key)"
          >
            {{ $t("page.settings.two_factor.remove") }}
          </UButton>
        </div>

        <UButton
          v-if="addableMethods.length > 0"
          variant="outline"
          color="neutral"
          icon="i-ph-plus"
          :loading="isProcessing"
          @click="
            addableMethods.length === 1
              ? addMethod(addableMethods[0]!.key)
              : (isAddMethodOpen = true)
          "
        >
          {{ $t("page.settings.two_factor.add_method") }}
        </UButton>

        <div v-if="hasAnyMethod">
          <UButton
            variant="link"
            size="sm"
            color="neutral"
            @click="openRegenerateModal"
          >
            {{ $t("page.settings.two_factor.backup_regenerate") }}
          </UButton>
        </div>
      </div>
    </div>

    <UModal
      v-model:open="isAddMethodOpen"
      :title="$t('page.settings.two_factor.add_method')"
    >
      <template #body>
        <div class="space-y-2">
          <button
            v-for="method in addableMethods"
            :key="method.key"
            class="border-default hover:bg-elevated flex w-full items-center gap-3 rounded-lg border p-4 text-left transition-colors"
            @click="addMethod(method.key)"
          >
            <UIcon
              :name="
                method.key === 'totp' ? 'i-ph-device-mobile' : 'i-ph-envelope'
              "
              class="text-dimmed size-5"
            />
            <span class="text-highlighted text-sm font-medium">
              {{ $t(method.label) }}
            </span>
          </button>
        </div>
      </template>
    </UModal>

    <UModal
      v-model:open="isTotpSetupOpen"
      :title="$t('page.settings.two_factor.totp_enable')"
    >
      <template #body>
        <div v-if="totpSetup" class="space-y-6">
          <p class="text-dimmed text-sm">
            {{ $t("page.settings.two_factor.setup_qr_description") }}
          </p>
          <div class="flex justify-center">
            <img
              :src="`${QR_CODE_API_BASE}${encodeURIComponent(totpSetup.otpAuthUrl)}`"
              alt="QR Code"
              class="size-48"
            />
          </div>
          <div class="text-center">
            <p class="text-muted text-xs">
              {{ $t("page.settings.two_factor.setup_secret_label") }}
            </p>
            <code class="text-highlighted text-sm">{{ totpSetup.secret }}</code>
          </div>
          <UFormField :label="$t('page.settings.two_factor.setup_verify_code')">
            <UInput
              v-model="totpVerifyCode"
              class="w-full"
              placeholder="000000"
            />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            variant="outline"
            color="neutral"
            @click="isTotpSetupOpen = false"
          >
            {{ $t("button.back") }}
          </UButton>
          <UButton :loading="isProcessing" @click="confirmTotp">
            {{ $t("button.continue") }}
          </UButton>
        </div>
      </template>
    </UModal>

    <UModal
      v-model:open="isDisableOpen"
      :title="$t('page.settings.two_factor.confirm_disable_title')"
    >
      <template #body>
        <div class="space-y-4">
          <p class="text-dimmed text-sm">
            {{ $t("page.settings.two_factor.confirm_disable_description") }}
          </p>
          <UFormField :label="$t('page.settings.two_factor.enter_code')">
            <UInput v-model="disableCode" class="w-full" placeholder="000000" />
          </UFormField>
          <UButton
            v-if="disablingMethod === 'email'"
            variant="link"
            size="sm"
            @click="requestDisableEmailCode"
          >
            {{ $t("page.settings.two_factor.send_code") }}
          </UButton>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            variant="outline"
            color="neutral"
            @click="isDisableOpen = false"
          >
            {{ $t("button.back") }}
          </UButton>
          <UButton
            color="error"
            :loading="isProcessing"
            @click="confirmDisable"
          >
            {{ $t("page.settings.two_factor.confirm_disable") }}
          </UButton>
        </div>
      </template>
    </UModal>

    <UModal
      v-model:open="isBackupCodesOpen"
      :title="$t('page.settings.two_factor.backup_title')"
    >
      <template #body>
        <div class="space-y-4">
          <div class="flex items-center gap-2">
            <UIcon name="i-ph-warning" class="text-warning size-5" />
            <p class="text-dimmed text-sm">
              {{ $t("page.settings.two_factor.backup_warning") }}
            </p>
          </div>
          <div
            class="bg-elevated grid grid-cols-2 gap-2 rounded-lg p-4 font-mono text-sm"
          >
            <span v-for="code in backupCodes" :key="code">{{ code }}</span>
          </div>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end">
          <UButton @click="isBackupCodesOpen = false">
            {{ $t("page.settings.two_factor.backup_dismiss") }}
          </UButton>
        </div>
      </template>
    </UModal>

    <UModal
      v-model:open="isRegenerateOpen"
      :title="$t('page.settings.two_factor.backup_regenerate')"
    >
      <template #body>
        <div class="space-y-4">
          <p class="text-dimmed text-sm">
            {{ $t("page.settings.two_factor.regenerate_description") }}
          </p>
          <UFormField :label="$t('page.settings.two_factor.enter_code')">
            <UInput
              v-model="regenerateCode"
              class="w-full"
              placeholder="000000"
            />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            variant="outline"
            color="neutral"
            @click="isRegenerateOpen = false"
          >
            {{ $t("button.back") }}
          </UButton>
          <UButton :loading="isProcessing" @click="confirmRegenerate">
            {{ $t("page.settings.two_factor.backup_regenerate") }}
          </UButton>
        </div>
      </template>
    </UModal>
  </DmsCard>
</template>
