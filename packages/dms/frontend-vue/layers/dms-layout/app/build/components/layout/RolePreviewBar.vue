<script setup lang="ts">
import { usePermissionPreview } from "#dms-core/app/build/composables/auth/usePermissionPreview";
import { listPreviewablePages } from "#dms-core/app/build/utils/permission-preview";

// v2 .cs-asbar: "Previewing <page> as <role> · unsaved changes included ·
// Exit preview", pinned under the dashboard header while a tab previews a
// role. The page name doubles as a picker to look at another page.
const preview = usePermissionPreview();
const siteLayout = useSiteLayout();
const route = useDmsRoute();
const { t } = useI18n();
const { processI18n } = useTranslation();

const pageItems = computed(() =>
  listPreviewablePages(siteLayout.siteLayout.value?.pages ?? {})
    .map(({ slug, page }) => ({
      label: processI18n(page.displayName),
      icon: page.icon,
      value: slug,
    }))
    .sort((left, right) => left.label.localeCompare(right.label)),
);

const currentPage = computed(() => siteLayout.findMatchingRoute(route.path));
const currentLabel = computed(() => {
  const metadata = currentPage.value?.metadata;
  return metadata
    ? processI18n(metadata.displayName)
    : t("page.settings.roles.preview.this_page");
});

const selectedSlug = computed({
  get: () => currentPage.value?.pattern,
  set: (slug: string | undefined) => {
    if (slug && slug !== currentPage.value?.pattern) void navigateDms(slug);
  },
});

const roleName = computed(
  () =>
    preview.session.value?.roleName || t("page.settings.roles.editor.untitled"),
);
const pageHidden = computed(() => preview.result.value?.page?.hidden === true);
// The page opens for the role, without some of its blocks or actions.
const pagePartial = computed(
  () => preview.entryState(preview.result.value?.page?.fullId) === "partial",
);
const outOfScope = computed(() => preview.result.value?.outOfScope ?? 0);
</script>

<template>
  <div
    v-if="preview.isActive.value"
    class="text-toned flex flex-wrap items-center gap-x-2.5 gap-y-1.5 border-b border-(--dms-accent-line) bg-(--dms-accent-tint) py-1.5 ps-4 pe-3 text-[12.5px]"
    role="region"
    :aria-label="t('page.settings.roles.preview.region_label')"
  >
    <!-- The eye sits inside the sentence so a narrow screen wraps the words,
         not the icon away from them. -->
    <span class="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
      <UIcon name="i-ph-eye" class="text-primary me-1 size-4 shrink-0" />
      <span>{{ t("page.settings.roles.preview.previewing") }}</span>
      <USelectMenu
        v-model="selectedSlug"
        :items="pageItems"
        value-key="value"
        size="xs"
        variant="ghost"
        class="text-highlighted -mx-1 max-w-[260px] font-semibold"
        :placeholder="currentLabel"
        :search-input="{
          placeholder: t('page.settings.roles.preview.search_pages'),
        }"
        :aria-label="t('page.settings.roles.preview.pick_page')"
      />
      <span>{{ t("page.settings.roles.preview.as") }}</span>
      <b class="text-highlighted font-semibold">{{ roleName }}</b>
      <span v-if="preview.session.value?.unsaved">
        · {{ t("page.settings.roles.preview.unsaved_included") }}
      </span>
    </span>
    <UBadge
      v-if="pageHidden"
      color="error"
      variant="soft"
      size="sm"
      icon="i-ph-lock-simple"
      :label="t('page.settings.roles.preview.page_hidden', { role: roleName })"
    />
    <UBadge
      v-else-if="pagePartial"
      color="warning"
      variant="soft"
      size="sm"
      icon="i-ph-lock-simple"
      :label="t('page.settings.roles.preview.page_partial', { role: roleName })"
      :title="t('page.settings.roles.preview.menu_partial', { role: roleName })"
    />
    <span v-if="outOfScope > 0" class="text-muted">
      {{ t("page.settings.roles.preview.out_of_scope", outOfScope) }}
    </span>
    <span
      v-if="preview.failed.value"
      class="text-error inline-flex items-center gap-1"
      role="alert"
    >
      <UIcon name="i-ph-warning-circle" class="size-3.5" />
      {{ t("page.settings.roles.preview.failed") }}
    </span>
    <UIcon
      v-if="preview.loading.value"
      name="i-ph-spinner-gap"
      class="text-muted size-3.5 animate-spin"
      :aria-label="t('page.settings.roles.preview.loading')"
    />
    <UButton
      class="ms-auto"
      icon="i-ph-x"
      size="xs"
      color="neutral"
      variant="outline"
      :label="t('page.settings.roles.preview.exit')"
      @click="preview.exit()"
    />
  </div>
  <!-- Holds the bar's place while a reloaded preview tab applies its preview
       (pre-paint script): hidden on any other tab. -->
  <div
    v-else
    aria-hidden="true"
    class="hidden h-[37px] items-center gap-2.5 border-b border-(--dms-accent-line) bg-(--dms-accent-tint) ps-4 pe-3 [html[data-dms-role-preview=pending]_&]:flex"
  >
    <USkeleton
      :aria-label="t('dms.a11y.loading')"
      class="size-4 rounded-full"
    />
    <USkeleton
      :aria-label="t('dms.a11y.loading')"
      class="h-3 w-64 max-w-[60%]"
    />
    <USkeleton :aria-label="t('dms.a11y.loading')" class="ms-auto h-6 w-24" />
  </div>
</template>
