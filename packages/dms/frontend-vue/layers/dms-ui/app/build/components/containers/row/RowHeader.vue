<script setup lang="ts">
/**
 * The header the DMS draws over a row opened in a side panel or a drawer:
 * the title (naming the row when the target words it), the row's position
 * among the rows the table shows, and previous / next (J and K too). The
 * container adds its close button in the default slot. A long title wraps
 * onto two lines before it is cut (a ticket subject, a site name on a phone).
 */
import { computed } from "vue";
import type { Component } from "vue";
import type { RowNavigation } from "../../../../types/row-navigation";

interface RowHeaderProps {
  heading?: string;
  /** i18n key (`$`-prefixed) of the position, receiving `{ index, total }`. */
  positionLabel?: string;
  navigation?: RowNavigation;
  /** Prefix of the `data-*` attributes tests and styles find the parts by. */
  part: string;
  headingClass?: string;
  /** Wraps the title only after this separator (`<wbr>` after each one). */
  headingBreakAfter?: string;
  /** Text after the position, on its line, cut at its end. */
  subtitle?: string;
  subtitleClass?: string;
  /** Drawn under the position line (pills, hints). */
  component?: Component;
  componentOptions?: Record<string, unknown>;
}

const props = withDefaults(defineProps<RowHeaderProps>(), {
  heading: undefined,
  positionLabel: undefined,
  navigation: undefined,
  headingClass: "text-[15px] leading-[1.3] font-[650] tracking-[-0.015em]",
  headingBreakAfter: undefined,
  subtitle: undefined,
  subtitleClass: undefined,
  component: undefined,
  componentOptions: undefined,
});

const DEFAULT_POSITION_KEY = "side_panel.position";

const { t, locale } = useI18n();
const { processI18n } = useTranslation();

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

const headingSegments = computed(() => {
  const separator = props.headingBreakAfter;
  if (!props.heading || !separator) return undefined;
  const parts = props.heading.split(separator);
  return parts.map((part, index) =>
    index < parts.length - 1 ? `${part}${separator}` : part,
  );
});

const partAttribute = (name: string) => ({
  [`data-${props.part}-${name}`]: "",
});
</script>

<template>
  <div class="flex min-w-0 flex-1 items-start gap-2">
    <div
      class="min-w-0 flex-1"
      :class="component ? 'space-y-1.5' : 'self-center'"
    >
      <div>
        <h2
          class="text-highlighted line-clamp-2 [overflow-wrap:anywhere]"
          :class="headingClass"
          :title="heading"
        >
          <template v-if="headingSegments">
            <template v-for="(segment, index) in headingSegments" :key="index">
              <span>{{ segment }}</span>
              <wbr />
            </template>
          </template>
          <template v-else>{{ heading }}</template>
        </h2>
        <p
          v-if="position || subtitle"
          class="text-muted mt-0.5 text-[12.5px]"
          :class="
            subtitle ? 'flex min-w-0 items-baseline gap-x-1.5' : 'tabular-nums'
          "
        >
          <span
            v-if="position"
            v-bind="partAttribute('position')"
            :class="subtitle && 'shrink-0 tabular-nums'"
          >
            {{ position }}
          </span>
          <span v-if="position && subtitle" aria-hidden="true">·</span>
          <span
            v-if="subtitle"
            v-bind="partAttribute('subtitle')"
            class="min-w-0 truncate"
            :class="subtitleClass"
            :title="subtitle"
          >
            {{ subtitle }}
          </span>
        </p>
      </div>
      <component :is="component" v-if="component" v-bind="componentOptions" />
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
