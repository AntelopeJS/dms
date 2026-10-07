<script setup lang="ts">
const { t } = useI18n();
const { groups } = useCommandPaletteGroups();
const fuse = COMMAND_PALETTE_FUSE_OPTIONS;
</script>

<template>
  <!-- Nuxt UI ships no `dashboardSearch.title` / `.description` message, so
       leaving these props out exposes those raw keys as the dialog's
       accessible name. -->
  <UDashboardSearch
    :groups="groups"
    :fuse="fuse"
    :title="t('commandPalette.dialog.title')"
    :description="t('commandPalette.dialog.description')"
  >
    <!-- v2 footer band: the keys that drive the palette. -->
    <template #footer>
      <span class="inline-flex items-center gap-1.5">
        <UKbd value="↑" size="sm" />
        <UKbd value="↓" size="sm" />
        {{ t("commandPalette.footer.navigate") }}
      </span>
      <span class="inline-flex items-center gap-1.5">
        <UKbd value="↵" size="sm" />
        {{ t("commandPalette.footer.open") }}
      </span>
      <span class="inline-flex items-center gap-1.5">
        <UKbd value="Esc" size="sm" />
        {{ t("commandPalette.footer.close") }}
      </span>
    </template>
  </UDashboardSearch>
</template>
