<script setup lang="ts">
import SettingsNav from "./SettingsNav.vue";
</script>

<template>
  <!-- v2 settings shell: one width for every settings page, the nav column
       sticking while the content scrolls. top-0: the scroll area's own top
       padding already gives the gap; any extra offset pushed the nav below
       its place whenever the content was tall enough, so it jumped on page
       changes and sat higher on short pages. -->
  <div
    class="mx-auto grid w-full max-w-[1200px] gap-4 lg:grid-cols-[216px_minmax(0,1fr)] lg:gap-10"
  >
    <SettingsNav class="lg:sticky lg:top-0 lg:self-start" />
    <div class="min-w-0">
      <slot />
    </div>
  </div>
</template>
