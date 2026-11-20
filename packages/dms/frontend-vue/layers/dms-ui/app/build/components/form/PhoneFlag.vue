<script setup lang="ts">
import type { CountryCode } from "libphonenumber-js/min";
import { loadPhoneFlag } from "../../utils/phoneFlags";

const props = defineProps<{
  code: CountryCode;
  /** The country's name, read out for the flag. Empty when text next to it already names the country. */
  name: string;
}>();

const url = ref<string>();

onMounted(() => {
  watch(
    () => props.code,
    async (code) => {
      url.value = undefined;
      const next = await loadPhoneFlag(code);
      if (props.code === code) url.value = next;
    },
    { immediate: true },
  );
});
</script>

<template>
  <img
    v-if="url"
    :src="url"
    :alt="props.name"
    :aria-hidden="props.name ? undefined : 'true'"
    width="18"
    height="12"
    class="ring-default h-3 w-[18px] shrink-0 rounded-[2px] object-cover ring-1"
  />
  <span
    v-else
    :role="props.name ? 'img' : undefined"
    :aria-label="props.name || undefined"
    :aria-hidden="props.name ? undefined : 'true'"
    class="bg-elevated h-3 w-[18px] shrink-0 rounded-[2px]"
  />
</template>
