<script setup lang="ts">
import {
  SECURITY_PAGE_PATH,
  useSecurityOverview,
} from "../../../../../composables/settings/security/useSecurityOverview";
import ProfileSummaryRow from "./ProfileSummaryRow.vue";

const { t } = useI18n();
const { overview, attention, isUnavailable, refresh } = useSecurityOverview();

const needsAttention = computed(() => attention.value.length > 0);

const facts = computed(() => {
  const data = overview.value;
  if (!data) return "";
  const sessions = t(
    "page.settings.profile.security_sessions",
    { count: data.activeSessions },
    data.activeSessions,
  );
  // An off two-factor is already the attention line: not said twice.
  if (!data.twoFactor.methods.length) return `${sessions}.`;
  const twoFactor = t("page.settings.profile.security_two_factor_on");
  return t("page.settings.profile.security_facts", { twoFactor, sessions });
});

// The skeleton's shape: the all-set sentence with two sessions.
const placeholder = computed(
  () =>
    `${t("page.settings.profile.security_all_good")} — ${t(
      "page.settings.profile.security_facts",
      {
        twoFactor: t("page.settings.profile.security_two_factor_on"),
        sessions: t("page.settings.profile.security_sessions", { count: 2 }, 2),
      },
    )}`,
);

onMounted(refresh);
</script>

<template>
  <!-- Points to where email, password, two-factor and sessions now live,
         with what needs attention there. -->
  <ProfileSummaryRow
    :icon="needsAttention ? 'i-ph-shield-warning' : 'i-ph-shield-check'"
    :tone="needsAttention ? 'warning' : overview ? 'success' : 'muted'"
    :loading="!overview && !isUnavailable"
    :placeholder="placeholder"
    :to="SECURITY_PAGE_PATH"
    :action-label="t('page.settings.profile.security_open')"
  >
    <template v-if="overview">
      <b class="text-highlighted font-semibold">
        {{
          needsAttention
            ? t(
                "page.settings.profile.security_attention",
                { count: attention.length },
                attention.length,
              )
            : t("page.settings.profile.security_all_good")
        }}
      </b>
      <template v-if="needsAttention">
        — {{ t(`page.settings.security.attention.${attention[0]}`) }}.
      </template>
      <template v-else>{{ " — " }}</template>
      {{ facts }}
    </template>
    <template v-else>
      {{ t("page.settings.profile.security_description") }}
    </template>
  </ProfileSummaryRow>
</template>
