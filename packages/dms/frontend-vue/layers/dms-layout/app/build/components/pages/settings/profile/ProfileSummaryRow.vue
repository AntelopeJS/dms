<script setup lang="ts">
import { computed } from "vue";
// Imported, not resolved by name: a registered component loads on first
// use, and the well would be missing for a frame when a row's data comes.
import DmsIconWell, {
  type IconWellTone,
} from "#dms-ui/app/components/icon-well/IconWell.vue";

interface ProfileSummaryRowProps {
  /** Iconify name of the row's icon well. */
  icon: string;
  tone?: IconWellTone;
  /** Bold lead of the summary, shown loaded or not (it is no data). */
  lead?: string;
  /**
   * The row's data has not arrived: the icon and the summary become
   * skeletons. The lead and the button stay, they do not depend on it.
   */
  loading?: boolean;
  /**
   * A sentence like the one that will come (same words, sample values),
   * drawn as the skeleton: it wraps like the real summary would at every
   * width and in every language, so the row keeps its height when the data
   * replaces it.
   */
  placeholder?: string;
  /** Route of the button; no button without one. */
  to?: string;
  /** Label of the button. */
  actionLabel?: string;
}

const props = withDefaults(defineProps<ProfileSummaryRowProps>(), {
  tone: "muted",
  lead: undefined,
  loading: false,
  placeholder: "",
  to: undefined,
  actionLabel: undefined,
});

// Letters and digits blanked to one glyph: the skeleton keeps the words'
// lengths and breaks, and the page never holds a sample "3 unread", even
// unseen.
const PLACEHOLDER_CHARACTERS = /[\p{L}\p{N}]/gu;
const PLACEHOLDER_GLYPH = "x";
const shape = computed(() =>
  props.placeholder.replace(PLACEHOLDER_CHARACTERS, PLACEHOLDER_GLYPH),
);

defineSlots<{
  /** The summary, after the lead. */
  default?: () => unknown;
}>();

const { t } = useI18n();
</script>

<template>
  <!-- v2 .cs-moved: a summary of another settings page, with the way
       there. Phones: the text keeps its place beside the icon, the button
       drops to a line of its own. -->
  <div
    class="border-muted flex flex-wrap items-center gap-3.5 border-t px-[18px] py-3.5 first:border-t-0"
  >
    <USkeleton
      :aria-label="t('dms.a11y.loading')"
      v-if="props.loading"
      aria-hidden="true"
      class="size-8 shrink-0 rounded-[9px]"
    />
    <DmsIconWell v-else :icon="props.icon" :tone="props.tone" size="sm" />
    <!-- Phones: as wide as the row beside the icon (32px + 14px gap), so
         the button always wraps. -->
    <div
      class="text-muted min-w-0 flex-1 basis-40 text-sm max-sm:basis-[calc(100%-46px)]"
    >
      <template v-if="props.lead">
        <b class="text-highlighted font-semibold">{{ props.lead }}</b>
        {{ " — " }}
      </template>
      <!-- Transparent text on a 12px bar per line it wraps to. -->
      <USkeleton
        :aria-label="t('dms.a11y.loading')"
        v-if="props.loading"
        as="span"
        aria-hidden="true"
        class="bg-transparent bg-[linear-gradient(var(--dms-skeleton),var(--dms-skeleton))] box-decoration-clone bg-size-[100%_12px] bg-center bg-no-repeat text-transparent select-none"
      >
        {{ shape }}
      </USkeleton>
      <slot v-else />
    </div>
    <UButton
      v-if="props.to"
      class="ms-auto shrink-0"
      color="neutral"
      variant="outline"
      size="sm"
      trailing-icon="i-ph-arrow-right"
      :to="props.to"
      :label="props.actionLabel"
    />
  </div>
</template>
