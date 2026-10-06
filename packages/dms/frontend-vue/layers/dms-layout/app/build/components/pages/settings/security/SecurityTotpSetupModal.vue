<script setup lang="ts">
import { useCopyFeedback } from "#dms-ui/app/build/composables/clipboard/useCopyFeedback";
import { useTemplateRef } from "vue";
import DmsOtpInput from "#dms-ui/app/build/components/form/OtpInput.vue";
import { codeEntryError } from "#dms-core/app/composables/useFormValidation";
import { useCodeFieldError } from "../../../../../composables/settings/security/useCodeFieldError";
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
// v2 .cs-step: the two steps of the setup, numbered in an accent disc.
const STEP_NUMBER_CLASS =
  "grid size-6 place-items-center rounded-full border border-(--dms-accent-line) bg-(--dms-accent-tint) font-mono text-[11px] font-semibold text-(--dms-accent)";
const STEP_TITLE_CLASS = "text-highlighted mt-[3px] text-sm font-semibold";
const KEY_GROUP = /.{1,4}/g;

const isOpen = defineModel<boolean>("open", { default: false });
/** A code the API refused, shown under the cells; typing clears it. */
const error = defineModel<string | undefined>("error");
const { t } = useI18n();
const { processApiMessage } = useTranslation();
const digits = ref<string[]>([]);
const codeField = useTemplateRef<HTMLElement>("codeField");

const { flag } = useCodeFieldError(digits, error, codeField);
const keyClipboard = useCopyFeedback();

const code = computed(() => digits.value.join(""));
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
  await keyClipboard.copyText(props.setup.manualKey, true);
}

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
          <span :class="STEP_NUMBER_CLASS">1</span>
          <div>
            <div :class="STEP_TITLE_CLASS">
              {{ t("page.settings.security.totp.scan_title") }}
            </div>
            <div class="text-muted mt-0.5 text-[12.5px]">
              {{ t("page.settings.security.totp.scan_description") }}
            </div>
            <!-- Phones: the key column stretches to the modal (the QR keeps
                 its size) so a long key truncates instead of overflowing. -->
            <div
              class="mt-2.5 flex items-center gap-4 max-sm:flex-col max-sm:items-stretch"
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
              <div class="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1.5">
                <span class="text-muted text-xs">
                  {{ t("page.settings.two_factor.setup_secret_label") }}
                </span>
                <!-- The key wraps between its groups rather than truncating:
                     it is typed by hand when the QR cannot be scanned. -->
                <code
                  class="text-highlighted border-accented flex min-h-8 items-center gap-1.5 rounded-md border bg-(--dms-bg-field) py-1 ps-2.5 pe-1 font-mono text-[12.5px] font-semibold tracking-[0.08em]"
                >
                  <span class="min-w-0 flex-1">{{ groupedKey }}</span>
                  <UButton
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    class="ms-auto shrink-0 self-start"
                    :icon="keyClipboard.iconOf(true)"
                    :label="
                      keyClipboard.isCopied(true)
                        ? t('page.settings.security.copied')
                        : t('page.settings.security.copy')
                    "
                    @click="copyKey"
                  />
                </code>
                <span class="text-muted flex items-center gap-1.5 text-xs">
                  <UIcon
                    name="i-ph-lock-simple"
                    class="text-dimmed size-3.5 shrink-0"
                  />
                  {{ t("page.settings.security.totp.local_hint") }}
                </span>
              </div>
            </div>
          </div>
        </div>
        <div class="grid grid-cols-[24px_minmax(0,1fr)] gap-3">
          <span :class="STEP_NUMBER_CLASS">2</span>
          <div ref="codeField">
            <div :class="STEP_TITLE_CLASS">
              {{ t("page.settings.security.totp.code_title") }}
            </div>
            <div class="text-muted mt-0.5 text-[12.5px]">
              {{ t("page.settings.security.totp.code_description") }}
            </div>
            <DmsOtpInput
              v-model="digits"
              class="mt-2.5"
              :label="t('page.settings.security.totp.code_title')"
              :length="CODE_LENGTH"
              type="number"
              size="lg"
              is-otp
              :error="error"
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
          :label="t('page.settings.security.totp.submit')"
          @click="confirm"
        />
      </div>
    </template>
  </UModal>
</template>
