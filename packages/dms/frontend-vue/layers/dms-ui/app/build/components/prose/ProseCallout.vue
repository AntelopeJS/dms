<script setup lang="ts">
import type { ProseCalloutKind } from "../../utils/markdown";

// A `> [!KIND]` quote of a Prose text: a frame in the kind's tone, headed by
// its icon and label. An SFC rather than part of the token renderer, so the
// template resolves `UIcon` like every other component.
interface ProseCalloutProps {
  kind: ProseCalloutKind;
}

interface ProseCalloutSlots {
  default?: () => unknown;
}

/** How each callout kind is drawn: its tone's frame, icon and title colour. */
interface CalloutLook {
  frame: string;
  title: string;
  icon: string;
}

const props = defineProps<ProseCalloutProps>();
defineSlots<ProseCalloutSlots>();

// Literal class strings: Tailwind only extracts classes it sees whole.
const CALLOUT_LOOKS: Record<ProseCalloutKind, CalloutLook> = {
  note: {
    frame: "border-info/35 bg-info/5",
    title: "text-info",
    icon: "i-ph-info",
  },
  tip: {
    frame: "border-success/35 bg-success/5",
    title: "text-success",
    icon: "i-ph-lightbulb",
  },
  important: {
    frame: "border-primary/35 bg-primary/5",
    title: "text-primary",
    icon: "i-ph-chat-centered-text",
  },
  warning: {
    frame: "border-warning/40 bg-warning/5",
    title: "text-warning",
    icon: "i-ph-warning",
  },
  caution: {
    frame: "border-error/35 bg-error/5",
    title: "text-error",
    icon: "i-ph-warning-octagon",
  },
};

const { t } = useI18n();
</script>

<template>
  <aside
    class="my-5 rounded-[10px] border px-4 py-3 [&>*:last-child]:mb-0 [&>p]:my-2"
    :class="CALLOUT_LOOKS[props.kind].frame"
    :data-callout="props.kind"
  >
    <div
      class="flex items-center gap-1.5 text-[13px] font-semibold"
      :class="CALLOUT_LOOKS[props.kind].title"
    >
      <UIcon
        :name="CALLOUT_LOOKS[props.kind].icon"
        class="size-4 shrink-0"
        aria-hidden="true"
      />
      {{ t(`dms.prose.callout.${props.kind}`) }}
    </div>
    <slot />
  </aside>
</template>
