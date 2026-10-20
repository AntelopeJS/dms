<script setup lang="ts">
/**
 * The header the DMS draws over a row opened in a side panel or a drawer:
 * the title (naming the row when the target words it), the row's position
 * among the rows the table shows, and previous / next (J and K too). The
 * container adds its close button in the default slot. A long title wraps
 * onto two lines before it is cut (a ticket subject, a site name on a phone).
 */
import { computed } from "vue";
import type { RowNavigation } from "../../../composables/actions/rowNavigation";

interface RowHeaderProps {
  heading?: string;
  /** i18n key (`$`-prefixed) of the position, receiving `{ index, total }`. */
  positionLabel?: string;
  navigation?: RowNavigation;
  /** Prefix of the `data-*` attributes tests and styles find the parts by. */
  part: string;
  headingClass?: string;
}

const props = withDefaults(defineProps<RowHeaderProps>(), {
  heading: undefined,
  positionLabel: undefined,
  navigation: undefined,
  headingClass: "text-[15px] leading-[1.3] font-[650] tracking-[-0.015em]",
});

const DEFAULT_POSITION_KEY = "side_panel.position";

const { t, locale } = useI18n();
const { processI18n } = useTranslation();

// "26 120", not "26120": the figures take the locale's grouping.
const numberFormat = computed(() => new Intl.NumberFormat(locale.value));

const position = computed(() => {
  if (!props.navigation) return undefined;
  const params = {
    index: numberFormat.value.format(props.navigation.index + 1),
    total: numberFormat.value.format(props.navigation.total),
  };
  return props.positionLabel
    ? processI18n(props.positionLabel, params)
    : t(DEFAULT_POSITION_KEY, params);
});

const partAttribute = (name: string) => ({
  [`data-${props.part}-${name}`]: "",
});
</script>

<template>
  <div class="flex min-w-0 flex-1 items-start gap-2">
    <div class="min-w-0 flex-1 self-center">
      <h2
        class="text-highlighted line-clamp-2 [overflow-wrap:anywhere]"
        :class="headingClass"
        :title="heading"
      >
        {{ heading }}
      </h2>
      <p
        v-if="position"
        v-bind="partAttribute('position')"
        class="text-muted mt-0.5 text-[12.5px] tabular-nums"
      >
        {{ position }}
      </p>
    </div>
    <div class="flex shrink-0 items-center gap-0.5">
      <template v-if="navigation">
        <UButton
          v-bind="partAttribute('prev')"
          icon="i-ph-caret-up"
          color="neutral"
          variant="ghost"
          size="sm"
          square
          :aria-label="t('side_panel.previous')"
          :disabled="!navigation.hasPrev"
          @click="navigation.prev()"
        />
        <UButton
          v-bind="partAttribute('next')"
          icon="i-ph-caret-down"
          color="neutral"
          variant="ghost"
          size="sm"
          square
          :aria-label="t('side_panel.next')"
          :disabled="!navigation.hasNext"
          @click="navigation.next()"
        />
      </template>
      <slot />
    </div>
  </div>
</template>
