<script setup lang="ts">
import type { StatGroupItem } from "#dms-ui/app/components/stat-group/StatGroup.vue";
import { useSecurityFormat } from "../../../../composables/settings/security/useSecurityFormat";
import {
  type SecurityOverview,
  useSecurityOverview,
} from "../../../../composables/settings/security/useSecurityOverview";

const METHODS_LABEL_KEYS: Record<string, string> = {
  "email,totp": "page.settings.security.status.methods_both",
  totp: "page.settings.security.status.methods_totp",
  email: "page.settings.security.status.methods_email",
};
const SKELETON_COUNT = 4;

const { t } = useI18n();
const { overview, attention, isUnavailable, refresh } = useSecurityOverview();
const { formatDate, daysSince } = useSecurityFormat();

function twoFactorItem(data: SecurityOverview): StatGroupItem {
  const methods = [...data.twoFactor.methods].sort().join(",");
  const isOn = methods.length > 0;
  return {
    id: "two-factor",
    to: "#two-factor",
    icon: isOn ? "i-ph-shield-check" : "i-ph-shield-warning",
    tone: isOn ? "success" : "warning",
    eyebrow: t("page.settings.security.status.two_factor"),
    value: t(isOn ? "page.settings.security.on" : "page.settings.security.off"),
    detail: t(
      METHODS_LABEL_KEYS[methods] ?? "page.settings.security.status.not_set_up",
    ),
    detailTone: isOn ? undefined : "warning",
  };
}

function backupDetail(
  twoFactor: SecurityOverview["twoFactor"],
  isUnsaved: boolean,
): string {
  if (!twoFactor.methods.length) {
    return t("page.settings.security.status.codes_need_two_factor");
  }
  if (isUnsaved) return t("page.settings.security.status.codes_unsaved");
  if (twoFactor.backupCodesSavedAt) {
    return t("page.settings.security.status.codes_saved", {
      date: formatDate(twoFactor.backupCodesSavedAt),
    });
  }
  return t("page.settings.security.status.codes_use");
}

function backupItem({ twoFactor }: SecurityOverview): StatGroupItem {
  const isOn = twoFactor.methods.length > 0;
  const isUnsaved = attention.value.includes("backup_codes_unsaved");
  const isLow = attention.value.includes("backup_codes_low");
  return {
    id: "backup-codes",
    to: "#backup-codes",
    icon: "i-ph-key",
    tone: isOn && (isUnsaved || isLow) ? "warning" : "muted",
    eyebrow: t("page.settings.security.status.backup_codes"),
    value: isOn
      ? t("page.settings.security.codes_left", {
          left: twoFactor.backupCodesLeft,
          total: twoFactor.backupCodesTotal,
        })
      : t("page.settings.security.status.codes_none"),
    detail: backupDetail(twoFactor, isUnsaved),
    detailTone: isUnsaved ? "warning" : undefined,
  };
}

function passwordItem(data: SecurityOverview): StatGroupItem {
  const base = {
    id: "password",
    to: "#password",
    icon: "i-ph-password",
    tone: "muted" as const,
    eyebrow: t("page.settings.security.status.password"),
  };
  if (!data.hasPassword) {
    return {
      ...base,
      value: t("page.settings.security.status.password_not_set"),
      detail: t("page.settings.security.status.password_sso"),
    };
  }
  if (!data.passwordChangedAt) {
    return {
      ...base,
      value: t("page.settings.security.status.password_unchanged"),
      detail: t("page.settings.security.status.account_created", {
        date: formatDate(data.accountCreatedAt),
      }),
    };
  }
  return {
    ...base,
    value: t(
      "page.settings.security.changed_days_ago",
      { count: daysSince(data.passwordChangedAt) },
      daysSince(data.passwordChangedAt),
    ),
    detail: formatDate(data.passwordChangedAt),
  };
}

function sessionsItem(data: SecurityOverview): StatGroupItem {
  const others = Math.max(0, data.activeSessions - 1);
  return {
    id: "sessions",
    to: "#sessions",
    icon: "i-ph-devices",
    tone: "muted",
    eyebrow: t("page.settings.security.status.sessions"),
    value: t(
      "page.settings.security.sessions_active",
      { count: data.activeSessions },
      data.activeSessions,
    ),
    detail: t(
      "page.settings.security.status.sessions_detail",
      { count: others },
      others,
    ),
  };
}

const items = computed<StatGroupItem[]>(() => {
  const data = overview.value;
  if (!data) return [];
  return [
    twoFactorItem(data),
    backupItem(data),
    passwordItem(data),
    sessionsItem(data),
  ];
});

// The summary feeds every block of the page: its failure is said once, here,
// with the retry that reloads them all.
const hasLoadError = computed(() => !overview.value && isUnavailable.value);
const retryActions = computed(() => [
  {
    label: t("dms.table.load_error_retry"),
    icon: "i-ph-arrows-clockwise",
    color: "neutral" as const,
    variant: "outline" as const,
    onClick: () => void refresh(),
  },
]);

onMounted(refresh);
</script>

<template>
  <!-- v2 .cs-status: one card split in four links, each jumping to its block. -->
  <div v-if="hasLoadError" class="dms-card mb-7">
    <DmsEmptyState
      variant="error"
      :title="t('dms.table.load_error_title')"
      :actions="retryActions"
      size="sm"
    />
  </div>
  <DmsStatGroup
    v-else
    class="mb-7"
    layout="joined"
    :items="items"
    :columns="SKELETON_COUNT"
    :loading="!items.length"
    :skeleton-count="SKELETON_COUNT"
    :label="t('page.settings.security.status_title')"
  />
</template>
