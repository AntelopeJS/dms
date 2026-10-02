<script setup lang="ts">
import type { TotpSetup } from "../../../../../composables/settings/security/useSecurityOverview";

interface SecurityTotpSetupModalProps {
  setup: TotpSetup | null;
  account: string;
  loading?: boolean;
}

const props = withDefaults(defineProps<SecurityTotpSetupModalProps>(), {
  loading: false,
});

const emit = defineEmits<{
  confirm: [code: string];
}>();

const CODE_LENGTH = 6;
const KEY_GROUP = /.{1,4}/g;
const COPIED_RESET_MS = 2000;

const isOpen = defineModel<boolean>("open", { default: false });
const { t } = useI18n();
const digits = ref<string[]>([]);
const isKeyCopied = ref(false);

const code = computed(() => digits.value.join(""));
const isComplete = computed(() => code.value.length === CODE_LENGTH);
const groupedKey = computed(
  () => props.setup?.manualKey.match(KEY_GROUP)?.join(" ") ?? "",
);

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

async function copyKey(): Promise<void> {
  if (!props.setup) return;
  await navigator.clipboard.writeText(props.setup.manualKey);
  isKeyCopied.value = true;
  setTimeout(() => (isKeyCopied.value = false), COPIED_RESET_MS);
}

function confirm(): void {
  if (!isComplete.value || props.loading) return;
  if (submittedCode.value === code.value) return;
  submittedCode.value = code.value;
  emit("confirm", code.value);
}
</script>

<template>
  <UModal
    v-model:open="isOpen"
    :title="t('page.settings.two_factor.totp_enable')"
    :description="t('page.settings.two_factor.setup_qr_description')"
    :ui="{ content: 'max-w-2xl' }"
  >
    <template #body>
      <form
        v-if="props.setup"
        class="grid gap-[18px]"
        @submit.prevent="confirm"
      >
        <div class="grid grid-cols-[24px_minmax(0,1fr)] gap-3">
          <span
            class="grid size-6 place-items-center rounded-full border border-(--dms-accent-line) bg-(--dms-accent-tint) font-mono text-[11px] font-semibold text-(--dms-accent)"
          >
            1
          </span>
          <div>
            <div class="text-highlighted mt-[3px] text-sm font-semibold">
              {{ t("page.settings.security.totp.scan_title") }}
            </div>
            <div class="text-muted mt-0.5 text-[12.5px]">
              {{ t("page.settings.security.totp.scan_description") }}
            </div>
            <div
              class="mt-2.5 flex items-center gap-4 max-sm:flex-col max-sm:items-start"
            >
              <img
                :src="props.setup.qrCode"
                :alt="
                  t('page.settings.security.totp.qr_alt', {
                    account: props.account,
                  })
                "
                class="border-accented size-[148px] shrink-0 rounded-[10px] border [image-rendering:pixelated]"
              />
              <div class="grid min-w-0 gap-1.5">
                <span class="text-muted text-xs">
                  {{ t("page.settings.two_factor.setup_secret_label") }}
                </span>
                <code
                  class="text-highlighted border-accented flex h-8 items-center gap-1.5 rounded-md border bg-(--dms-bg-field) ps-2.5 pe-1 font-mono text-[12.5px] font-semibold tracking-[0.08em] whitespace-nowrap"
                >
                  <span class="truncate">{{ groupedKey }}</span>
                  <UButton
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    class="ms-auto"
                    :icon="isKeyCopied ? 'i-ph-check' : 'i-ph-copy'"
                    :label="
                      isKeyCopied
                        ? t('page.settings.security.copied')
                        : t('page.settings.security.copy')
                    "
                    @click="copyKey"
                  />
                </code>
                <span class="text-muted flex items-center gap-1.5 text-xs">
                  <UIcon name="i-ph-lock-simple" class="text-dimmed size-3.5" />
                  {{ t("page.settings.security.totp.local_hint") }}
                </span>
              </div>
            </div>
          </div>
        </div>
        <div class="grid grid-cols-[24px_minmax(0,1fr)] gap-3">
          <span
            class="grid size-6 place-items-center rounded-full border border-(--dms-accent-line) bg-(--dms-accent-tint) font-mono text-[11px] font-semibold text-(--dms-accent)"
          >
            2
          </span>
          <div>
            <div class="text-highlighted mt-[3px] text-sm font-semibold">
              {{ t("page.settings.security.totp.code_title") }}
            </div>
            <div class="text-muted mt-0.5 text-[12.5px]">
              {{ t("page.settings.security.totp.code_description") }}
            </div>
            <UPinInput
              v-model="digits"
              class="mt-2.5"
              :length="CODE_LENGTH"
              otp
              type="number"
              size="lg"
              :aria-label="t('page.settings.security.totp.code_title')"
              @complete="confirm"
            />
          </div>
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
          :loading="props.loading"
          :disabled="!isComplete"
          :label="t('page.settings.security.totp.submit')"
          @click="confirm"
        />
      </div>
    </template>
  </UModal>
</template>
