<script setup lang="ts">
import Register from "../components/onboarding/steps/register.vue";

// A custom page runs the global middleware only once it declares its meta:
// that is what lets the onboarding middleware send a visitor away from a
// wizard that is already finished, on a direct load as on a navigation.
defineDmsPageMeta({});
</script>

<template>
  <Register />
</template>
