<script setup lang="ts">
import { computed } from "vue";
import { EXTERNAL_LINK_ATTRIBUTES, linkKind } from "../../utils/link";

// A link whose target comes from data (a block option, a fetched row): a DMS
// route goes through <DmsLink> (Inertia visit), an in-page anchor stays a bare
// <a href="#…">, and an absolute URL opens in a new tab. Unstyled, so the
// caller's classes (.dms-card, a row) style it.
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
