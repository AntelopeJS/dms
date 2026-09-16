<script setup lang="ts">
const appConfig = useDmsAppConfig();
</script>

<template>
  <UColorModeImage
    v-if="appConfig.branding.logo"
    :light="appConfig.branding?.logo?.default.light"
    :dark="appConfig.branding?.logo?.default.dark"
  />
</template>
