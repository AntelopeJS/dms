<script setup lang="ts">
import type { KeyValueItem } from "#dms-ui/app/components/key-value-list/KeyValueList.vue";

interface TwoFactorStatus {
  methods: string[];
  hasBackupCodes: boolean;
}

const PROFILE_PATH = "/settings/user/profile";
const TWO_FACTOR_ENDPOINT = "/settings/user/profile/two-factor";

const { t, locale } = useI18n();
const { user } = useCurrentUser();
const isOwner = useIsOwner();
const { $authFetch } = useAuthFetch();

const twoFactor = ref<TwoFactorStatus | null>(null);

onMounted(async () => {
  try {
    twoFactor.value = await $authFetch<TwoFactorStatus>(TWO_FACTOR_ENDPOINT);
  } catch {
    twoFactor.value = null;
  }
});

// Some locales name their language in lower case ("français"); the summary
// shows it as a label, capitalized.
const languageName = computed(() => {
  const names = new Intl.DisplayNames([locale.value], { type: "language" });
  const name = names.of(locale.value) ?? locale.value;
  return name.charAt(0).toLocaleUpperCase(locale.value) + name.slice(1);
});

const twoFactorLabel = computed(() => {
  const methods = twoFactor.value?.methods ?? [];
  return methods.length
    ? t("page.settings.overview.two_factor_on", {
        methods: methods.join(", "),
      })
    : t("page.settings.overview.two_factor_off");
});

const accountItems = computed<KeyValueItem[]>(() => [
  {
    id: "two-factor",
    label: t("page.settings.overview.two_factor"),
    value: twoFactorLabel.value,
  },
  {
    id: "backup-codes",
    label: t("page.settings.overview.backup_codes"),
    value: twoFactor.value?.hasBackupCodes
      ? t("page.settings.overview.backup_codes_ready")
      : t("page.settings.overview.backup_codes_missing"),
    tone: twoFactor.value?.hasBackupCodes ? undefined : "warning",
  },
  {
    id: "language",
    label: t("page.settings.overview.language"),
    value: languageName.value,
  },
]);
</script>

<template>
  <!-- v2 "Your account" summary card at the top of the settings overview. -->
  <section class="dms-card overflow-hidden">
    <header
      class="border-default flex min-h-12 items-center gap-3 border-b ps-[18px] pe-4"
    >
      <DmsEyebrow
        as="span"
        tone="muted"
        :label="t('page.settings.overview.your_account')"
      />
      <DmsLink
        :to="PROFILE_PATH"
        class="text-primary ms-auto inline-flex items-center gap-1 text-[12.5px] font-[550]"
      >
        {{ t("page.settings.overview.edit_profile") }}
        <UIcon name="i-ph-arrow-right" class="size-3.5" />
      </DmsLink>
    </header>
    <div class="flex items-center gap-3 px-[18px] pt-4 pb-2">
      <UAvatar
        :alt="user?.name"
        size="lg"
        :ui="{
          root: 'bg-linear-135 from-(--ui-color-primary-400) to-(--ui-color-secondary-400)',
          fallback: 'font-mono font-bold text-(--dms-accent-on-fill)',
        }"
      />
      <div class="min-w-0 flex-1">
        <div class="text-highlighted truncate text-sm font-semibold">
          {{ user?.name }}
        </div>
        <div class="text-muted truncate font-mono text-xs">
          {{ user?.email }}
        </div>
      </div>
      <span
        v-if="isOwner"
        class="inline-flex h-[22px] items-center gap-1 rounded-full bg-(--dms-accent-fill) px-[9px] font-mono text-[11px] font-[550] text-(--dms-accent-on-fill)"
      >
        <UIcon name="i-ph-crown-simple" class="size-3" />
        {{ t("page.settings.overview.owner") }}
      </span>
    </div>
    <DmsKeyValueList class="px-[18px] pb-2" :items="accountItems" />
  </section>
</template>
