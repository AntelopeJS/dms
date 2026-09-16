<script setup lang="ts">
import Footer from "../build/components/layout/Footer.vue";

defineOptions({
  inheritAttrs: false,
});
</script>

<template>
  <div class="flex min-h-screen flex-col">
    <header class="my-16 flex w-full justify-center">
      <DmsAppLogo class="h-20 w-auto" />
    </header>

    <!-- Named so a module's overlay can measure the region a page occupies,
         the same way DefaultLayout marks its container. -->
    <main class="flex-1" data-dms-page-content>
      <slot />
    </main>

    <Footer />
  </div>
</template>
