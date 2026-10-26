<script setup lang="ts">
import { computed } from "vue";
import { EXTERNAL_LINK_ATTRIBUTES, linkKind } from "../../build/utils/link";

interface AutoLinkProps {
  /** Route path, `#anchor` or absolute URL. */
  to: string;
}

interface AutoLinkSlots {
  default?: () => unknown;
}

const props = defineProps<AutoLinkProps>();
defineSlots<AutoLinkSlots>();

const kind = computed(() => linkKind(props.to));
</script>

<template>
  <DmsLink v-if="kind === 'internal'" :to="props.to"><slot /></DmsLink>
  <a
    v-else
    :href="props.to"
    v-bind="kind === 'external' ? EXTERNAL_LINK_ATTRIBUTES : {}"
  >
    <slot />
  </a>
</template>
