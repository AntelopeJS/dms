<script setup lang="ts">
import { useProfilePreferences } from "../../../../../composables/settings/profile/useProfilePreferences";
import ProfileSummaryRow from "./ProfileSummaryRow.vue";

const KEY = "page.settings.profile.preferences";

const { t } = useI18n();
const {
  rows,
  accessSummary,
  regionSummary,
  notificationsSummary,
  hasUnread,
  appearanceSummary,
  placeholders,
} = useProfilePreferences();
</script>

<template>
  <!-- One summary per settings page that follows the user around, each
       shown only when that page opens for them. -->
  <DmsSection :title="`$${KEY}.title`" :description="`$${KEY}.description`">
    <ProfileSummaryRow
      icon="i-ph-key"
      :lead="t(`${KEY}.access_title`)"
      :loading="accessSummary === undefined"
      :placeholder="placeholders.access"
      :to="rows.access.to"
      :action-label="t(`${KEY}.access_view`)"
    >
      {{ accessSummary }}
    </ProfileSummaryRow>
    <ProfileSummaryRow
      v-if="rows.region.visible"
      icon="i-ph-globe-hemisphere-west"
      :lead="t(`${KEY}.region_title`)"
      :loading="regionSummary === undefined"
      :placeholder="placeholders.region"
      :to="rows.region.to"
      :action-label="t(`${KEY}.region_edit`)"
    >
      {{ regionSummary }}
    </ProfileSummaryRow>
    <ProfileSummaryRow
      v-if="rows.notifications.visible"
      :icon="hasUnread ? 'i-ph-bell-ringing' : 'i-ph-bell'"
      :tone="hasUnread ? 'warning' : 'muted'"
      :lead="t(`${KEY}.notifications_title`)"
      :loading="notificationsSummary === undefined"
      :placeholder="placeholders.notifications"
      :to="rows.notifications.to"
      :action-label="t(`${KEY}.notifications_manage`)"
    >
      {{ notificationsSummary }}
    </ProfileSummaryRow>
    <ProfileSummaryRow
      v-if="rows.appearance.visible"
      icon="i-ph-swatches"
      :lead="t(`${KEY}.appearance_title`)"
      :loading="appearanceSummary === undefined"
      :placeholder="placeholders.appearance"
      :to="rows.appearance.to"
      :action-label="t(`${KEY}.appearance_customize`)"
    >
      {{ appearanceSummary }}
    </ProfileSummaryRow>
  </DmsSection>
</template>
