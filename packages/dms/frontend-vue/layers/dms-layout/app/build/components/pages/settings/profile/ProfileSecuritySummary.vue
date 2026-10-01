<script setup lang="ts">
import {
  SECURITY_PAGE_PATH,
  useSecurityOverview,
} from "../../../../../composables/settings/security/useSecurityOverview";

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

onMounted(refresh);
</script>

<template>
  <DmsSection
    title="$page.settings.profile.security_title"
    description="$page.settings.profile.security_description"
  >
    <!-- v2 .cs-moved: points to where email, password, two-factor and
         sessions now live, with what needs attention there. -->
    <div class="flex items-center gap-3.5 px-[18px] py-3.5 max-sm:flex-wrap">
      <DmsIconWell
        :icon="needsAttention ? 'i-ph-shield-warning' : 'i-ph-shield-check'"
        :tone="needsAttention ? 'warning' : overview ? 'success' : 'muted'"
        size="sm"
      />
      <div class="text-muted min-w-0 text-sm">
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
        <template v-else-if="isUnavailable">
          {{ t("page.settings.profile.security_description") }}
        </template>
        <USkeleton v-else class="h-4 w-80 max-w-full" />
      </div>
      <UButton
        class="ms-auto shrink-0"
        color="neutral"
        variant="outline"
        size="sm"
        trailing-icon="i-ph-arrow-right"
        :to="SECURITY_PAGE_PATH"
        :label="t('page.settings.profile.security_open')"
      />
    </div>
  </DmsSection>
</template>
