<script setup lang="ts">
import Footer from "../build/components/layout/Footer.vue";

defineOptions({
  inheritAttrs: false,
});

const DARK_CLASS = "dark";

const { t } = useI18n();
const colorModePreference = useColorModePreference();

// Same preference cookie as the dashboard header toggle. The resolved mode is
// read from the class the color mode plugin keeps on <html>, which settles
// `system` too; the icons switch through `dark:`, so SSR never has to know.
function toggleColorMode(): void {
  const isDark = document.documentElement.classList.contains(DARK_CLASS);
  colorModePreference.value = isDark ? "light" : "dark";
}
</script>

<template>
  <!-- v2 .au-stage: the canvas with, in dark only, a cyan glow centred
       behind the card. -->
  <div
    class="bg-muted relative isolate flex min-h-screen flex-col overflow-hidden"
  >
    <div
      aria-hidden="true"
      class="pointer-events-none absolute top-[150px] left-1/2 -z-10 h-[560px] w-[720px] max-w-full -translate-x-1/2 bg-(image:--dms-stage-glow)"
    />

    <UButton
      variant="ghost"
      color="neutral"
      square
      class="text-muted hover:text-highlighted absolute top-3.5 right-4 z-10"
      :title="t('empty_layout.theme_toggle')"
      :aria-label="t('empty_layout.theme_toggle')"
      @click="toggleColorMode"
    >
      <UIcon
        name="i-ph-sun-light"
        class="hidden size-[18px] dark:inline-block"
      />
      <UIcon name="i-ph-moon-light" class="size-[18px] dark:hidden" />
    </UButton>

    <header class="mt-9 mb-3.5 flex w-full justify-center">
      <DmsAppLogo class="h-14 w-auto" />
    </header>

    <!-- Named so a module's overlay can measure the region a page occupies,
         the same way DefaultLayout marks its container. -->
    <main class="flex-1 px-3 pb-8 sm:px-5 sm:pb-10" data-dms-page-content>
      <slot />
    </main>

    <Footer />
  </div>
</template>
