<script setup lang="ts">
import { computed } from "vue";
import type { DefaultComponentProps } from "../../../../dms-core/app/types/component";
import DmsEmptyStateBlock from "../blocks/EmptyStateBlock.vue";
import {
  type GuardCondition,
  type GuardFallback,
  type GuardState,
  useGuard,
} from "../../build/composables/blocks/useGuard";
import { notFoundTexts } from "../../build/utils/fetchNotFound";

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

const DEFAULT_FALLBACKS: Record<
  GuardCondition,
  (state: GuardState) => GuardFallback
> = {
  empty: () => ({ title: t("dms.blocks.empty") }),
  notFound: ({ notFound }) => ({
    ...notFoundTexts(notFound, t),
    variant: "no-result",
  }),
};

const fallback = computed<GuardFallback | null>(() => {
  const current = state.value;
  if (!current) return null;
  return {
    ...DEFAULT_FALLBACKS[current.condition](current),
    ...props.fallback,
    ...current.override,
  };
});
</script>

<template>
  <div class="space-y-6" data-dms-guard>
    <DmsEmptyStateBlock v-if="fallback" v-bind="fallback" />
    <slot v-else />
  </div>
</template>
