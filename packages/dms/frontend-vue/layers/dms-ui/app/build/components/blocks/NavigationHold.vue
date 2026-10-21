<script setup lang="ts">
/**
 * Draws nothing and settles once `until` does: an async dependency of the
 * Suspense the page renders in, so a client navigation waits for it, as it
 * waits for the page's own data. A block places one only when it holds the
 * navigation (`holdNavigation`), and stays a synchronous component itself:
 * mounted outside a Suspense, or without the option, it renders at once.
 */
interface NavigationHoldProps {
  until: Promise<void>;
}

const props = defineProps<NavigationHoldProps>();

await props.until;
</script>

<template>
  <!-- Nothing to draw: it only holds the navigation. -->
  <span hidden />
</template>
