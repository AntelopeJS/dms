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
  />
</template>
