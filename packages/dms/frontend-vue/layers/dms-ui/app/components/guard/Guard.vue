<script setup lang="ts">
import { computed } from "vue";
import type { DefaultComponentProps } from "../../../../dms-core/app/types/component";
import DmsEmptyStateBlock from "../blocks/EmptyStateBlock.vue";
import {
  type GuardCondition,
  type GuardFallback,
  useGuard,
} from "../../build/composables/blocks/useGuard";

// `Guard` block (interface-dms `base/guard`): renders its children unchanged
// unless a route says there is nothing for them, then one EmptyState (the
// `fallback`, with the answer's `emptyState` laid over it) in their place.
// `display: contents`, so the children lay out as if the guard were not there.
interface GuardProps extends DefaultComponentProps {
  fetchUrl?: string;
  fetchUrlMethod?: string;
  periodScope?: string;
  realtimeTopic?: string | string[];
  when?: GuardCondition;
  /** Dot path of the value `empty` checks. */
  field?: string;
  fallback?: GuardFallback;
}

const props = withDefaults(defineProps<GuardProps>(), {
  fetchUrl: undefined,
  fetchUrlMethod: undefined,
  periodScope: undefined,
  realtimeTopic: undefined,
  when: "empty",
  field: undefined,
  fallback: undefined,
});

const { t } = useI18n();

const state = useGuard(
  () => props,
  () => props.routeParams,
);

const DEFAULT_FALLBACKS: Record<GuardCondition, () => GuardFallback> = {
  empty: () => ({ title: t("dms.blocks.empty") }),
  notFound: () => ({ title: t("dms.blocks.not_found"), variant: "no-result" }),
};

const fallback = computed<GuardFallback | null>(() => {
  const current = state.value;
  if (!current) return null;
  return {
    ...DEFAULT_FALLBACKS[current.condition](),
    ...props.fallback,
    ...current.override,
  };
});
</script>

<template>
  <div class="contents" data-dms-guard>
    <DmsEmptyStateBlock v-if="fallback" v-bind="fallback" />
    <slot v-else />
  </div>
</template>
