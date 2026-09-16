<script setup lang="ts">
// Keyboard combo (design .kcombo): Nuxt UI <UKbd> caps joined by dimmed "+"
// separators. The .kkey look (mono, inset surface, thicker bottom edge) is
// applied via the size="lg" variant in app.config (ui.kbd), not here.
interface Props {
  keys: string[];
}

defineProps<Props>();
</script>

<template>
  <div class="inline-flex items-center gap-1.5">
    <template v-for="(key, index) in keys" :key="index">
      <span v-if="index > 0" class="text-dimmed text-[11px]">+</span>
      <UKbd size="lg" :value="key" />
    </template>
  </div>
</template>
