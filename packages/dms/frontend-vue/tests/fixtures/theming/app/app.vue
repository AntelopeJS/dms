<script setup lang="ts">
import { usePage } from "@inertiajs/vue3";
import { useDark } from "@vueuse/core";
import AppLogo from "../../../../layers/dms-layout/app/components/layout/AppLogo.vue";
import type defaults from "../base/app/app.config";
const config = usePage().props.config as typeof defaults;
const isDark = useDark();
const enabled = ref(true);
const isReady = ref(false);
onMounted(() => {
  isReady.value = true;
});
</script>

<template>
  <UApp>
    <main :data-ready="isReady" class="bg-muted text-default min-h-screen p-12">
      <div class="dms-card mx-auto max-w-2xl space-y-6 p-8">
        <h1 class="text-3xl font-semibold">Consumer theming</h1>
        <AppLogo class="h-12 w-auto" />
        <UColorModeImage
          :light="config.branding.logo.collapsed.light"
          :dark="config.branding.logo.collapsed.dark"
          class="size-12"
        />
        <div class="flex gap-4">
          <UButton id="primary">Primary action</UButton>
          <UButton color="success">Success action</UButton>
        </div>
        <USwitch id="primary-switch" v-model="enabled" label="Primary switch" />
        <USwitch
          id="success-switch"
          :model-value="true"
          color="success"
          label="Success switch"
        />
        <USwitch :model-value="false" label="Unchecked switch" />
        <UButton id="mode" color="neutral" @click="isDark = !isDark">
          Toggle color mode
        </UButton>
        <pre id="config" class="text-xs break-all whitespace-pre-wrap"
          >{{ JSON.stringify(config.branding.logo) }} / {{
            config.ui.colors.primary
          }}</pre
        >
      </div>
    </main>
  </UApp>
</template>
