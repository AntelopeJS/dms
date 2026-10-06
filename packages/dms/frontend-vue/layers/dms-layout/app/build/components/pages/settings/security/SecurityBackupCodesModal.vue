<script setup lang="ts">
interface SecurityBackupCodesModalProps {
  codes: string[];
  /** Codes replace a previous set, which stopped working. */
  isRegenerated?: boolean;
  account: string;
}

const props = withDefaults(defineProps<SecurityBackupCodesModalProps>(), {
  isRegenerated: false,
});

const emit = defineEmits<{
  /** The user downloaded, copied or confirmed keeping the codes. */
  saved: [];
}>();

const FILE_NAME = "dms-backup-codes.txt";
const FILE_TYPE = "text/plain";

const isOpen = defineModel<boolean>("open", { default: false });
const { t } = useI18n();
const isCopied = ref(false);
const isDownloaded = ref(false);

// Shown exactly as they are typed at sign-in: no grouping separator.
const displayCodes = computed(() => props.codes);

watch(isOpen, (open) => {
  if (!open) return;
  isCopied.value = false;
  isDownloaded.value = false;
});

function codesText(): string {
  return [
    t("page.settings.security.backup.file_header", { account: props.account }),
    "",
    ...displayCodes.value,
  ].join("\n");
}

async function copy(): Promise<void> {
  await navigator.clipboard.writeText(displayCodes.value.join("\n"));
  isCopied.value = true;
  emit("saved");
}

function download(): void {
  const url = URL.createObjectURL(new Blob([codesText()], { type: FILE_TYPE }));
  const link = document.createElement("a");
  link.href = url;
  link.download = FILE_NAME;
  link.click();
  URL.revokeObjectURL(url);
  isDownloaded.value = true;
  emit("saved");
}

function acknowledge(): void {
  emit("saved");
  isOpen.value = false;
}
</script>

<template>
  <UModal
    v-model:open="isOpen"
    :dismissible="false"
    :ui="{ content: 'max-w-lg' }"
  >
    <template #header>
      <div class="flex items-start gap-3">
        <DmsIconWell icon="i-ph-key" tone="success" size="xl" />
        <div class="grid gap-1">
          <h3 class="text-highlighted text-base font-semibold">
            {{ t("page.settings.security.backup.modal_title") }}
          </h3>
          <p class="text-muted text-sm">
            {{ t("page.settings.two_factor.backup_warning") }}
          </p>
        </div>
      </div>
    </template>
    <template #body>
      <div class="grid gap-3.5">
        <!-- Two columns, one when a code no longer fits half the list
             (phones). -->
        <ol
          class="border-default grid grid-cols-[repeat(auto-fill,minmax(max(8.5rem,calc(50%-1rem)),1fr))] gap-x-4 gap-y-1.5 rounded-md border bg-(--dms-bg-muted) px-4 py-3.5"
        >
          <li
            v-for="(code, index) in displayCodes"
            :key="code"
            class="text-highlighted flex items-center gap-2.5 font-mono text-[13px] font-semibold tracking-[0.06em]"
          >
            <span class="text-dimmed text-[10px] font-normal tracking-normal">
              {{ String(index + 1).padStart(2, "0") }}
            </span>
            {{ code }}
          </li>
        </ol>
        <div class="flex gap-2">
          <UButton
            class="flex-1 justify-center"
            color="neutral"
            variant="outline"
            :icon="isDownloaded ? 'i-ph-check' : 'i-ph-download-simple'"
            :label="t('page.settings.security.backup.download')"
            @click="download"
          />
          <UButton
            class="flex-1 justify-center"
            :color="isCopied ? 'success' : 'neutral'"
            variant="outline"
            :icon="isCopied ? 'i-ph-check' : 'i-ph-copy'"
            :label="
              isCopied
                ? t('page.settings.security.copied')
                : t('page.settings.security.copy')
            "
            @click="copy"
          />
        </div>
        <DmsBanner
          v-if="props.isRegenerated"
          size="sm"
          tone="warning"
          icon="i-ph-warning"
          :description="t('page.settings.security.backup.regenerated_note')"
        />
      </div>
    </template>
    <template #footer>
      <div class="flex w-full flex-wrap items-center justify-end gap-2">
        <span
          v-if="isCopied || isDownloaded"
          class="text-success me-auto flex items-center gap-1.5 text-xs font-medium"
        >
          <UIcon name="i-ph-check-circle" class="size-4" />
          {{
            isCopied
              ? t(
                  "page.settings.security.backup.copied_count",
                  { count: props.codes.length },
                  props.codes.length,
                )
              : t("page.settings.security.backup.downloaded")
          }}
        </span>
        <UButton
          :label="t('page.settings.security.backup.acknowledge')"
          @click="acknowledge"
        />
      </div>
    </template>
  </UModal>
</template>
