<script setup lang="ts">
import { usePermissionPreview } from "#dms-core/app/composables/auth/usePermissionPreview";
import SettingsAccountSummary from "../../build/components/pages/settings/shell/SettingsAccountSummary.vue";
import SettingsActivityCard from "../../build/components/pages/settings/shell/SettingsActivityCard.vue";
import {
  SettingsNavGroupId,
  useSettingsNavigation,
} from "../../composables/settings/useSettingsNavigation";
import { useSettingsNavTrails } from "../../composables/settings/useSettingsNavTrails";

const siteLayout = useSiteLayout();
if (!siteLayout.siteLayout.value) {
  await siteLayout.loadSiteLayout();
}

if (siteLayout.loadingError && siteLayout.loadingError.value) {
  throw createError({
    statusCode: HTTP_INTERNAL_SERVER_ERROR,
    statusMessage: "Error loading site layout",
    message: siteLayout.loadingError.value || "Unknown error occurred",
  });
}

const GROUP_DESCRIPTIONS: Record<string, string> = {
  [SettingsNavGroupId.ACCOUNT]: "$page.settings.overview.account_description",
  [SettingsNavGroupId.WORKSPACE]:
    "$page.settings.overview.workspace_description",
};
const OTHER_GROUP_DESCRIPTION = "$page.settings.overview.other_description";

const { groups } = useSettingsNavigation();
const { trails, isTrailPending } = useSettingsNavTrails();
const { processI18n } = useTranslation();
const { t } = useI18n();

// "Preview as role": the card of a page the role could not open is veiled,
// like the sidebar entry and the settings nav item; the card of a page it
// opens without all of it carries the orange partial veil. Never outside a
// preview.
const preview = usePermissionPreview();
const previewRole = computed(() => ({
  role: preview.session.value?.roleName ?? "",
}));
const previewVeilLabel = (fullId: string): string => {
  const state = preview.entryState(fullId);
  if (state === "hidden") {
    return t("page.settings.roles.preview.veil_hidden", previewRole.value);
  }
  return state === "partial"
    ? t("page.settings.roles.preview.veil_partial")
    : "";
};
const previewVeilDetail = (fullId: string): string | undefined =>
  preview.entryState(fullId) === "partial"
    ? t("page.settings.roles.preview.menu_partial", previewRole.value)
    : undefined;
</script>

<template>
  <div>
    <div class="mb-8 grid gap-4 @2xl/settings:grid-cols-2">
      <SettingsAccountSummary />
      <SettingsActivityCard />
    </div>

    <DmsSection
      v-for="group in groups"
      :key="group.id"
      :title="group.label"
      :description="GROUP_DESCRIPTIONS[group.id] ?? OTHER_GROUP_DESCRIPTION"
      bare
    >
      <!-- As many 16rem tracks as the settings column holds: fixed
           viewport breakpoints squeezed three cards into it at 1280px (and
           two at 1024px), truncating their titles. -->
      <div
        class="grid grid-cols-[repeat(auto-fill,minmax(min(100%,16rem),1fr))] gap-3"
      >
        <!-- v2 settings navcard (.sx-grid): tighter rhythm, the page's live
             state in mono, and its module tag after the title. -->
        <DmsPermissionVeil
          v-for="page in group.pages"
          :key="page.fullId"
          :state="preview.entryState(page.fullId)"
          :label="previewVeilLabel(page.fullId)"
          :detail="previewVeilDetail(page.fullId)"
          :persistent="preview.isActive.value"
        >
          <DmsNavCard
            class="hover:border-primary/35 h-full gap-2.5"
            :to="page.to"
            :icon="page.icon"
            :title="processI18n(page.label)"
            :description="processI18n(page.description)"
            :badge="trails[page.fullId]?.tag"
            :state="trails[page.fullId]?.label ?? trails[page.fullId]?.badge"
            :state-tone="trails[page.fullId]?.status ?? 'neutral'"
            :state-pending="isTrailPending(page.fullId)"
          />
        </DmsPermissionVeil>
      </div>
    </DmsSection>
  </div>
</template>
