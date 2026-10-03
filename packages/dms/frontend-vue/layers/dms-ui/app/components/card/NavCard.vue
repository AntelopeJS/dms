<script setup lang="ts">
import { computed, useAttrs } from "vue";
import { tv } from "tailwind-variants";
import DmsIconWell, { type IconWellTone } from "../icon-well/IconWell.vue";
import DmsStatusPill from "../status-pill/StatusPill.vue";
import DmsAutoLink from "../link/AutoLink.vue";
import type { DmsTone } from "../../utils/tone";

// Navigation tile (v2 .navcard): an icon well + title + description rendered
// as a clickable card linking elsewhere (settings overview, a module's home),
// optionally closed by the target's live state (v2 .sx-state, pinned to the
// bottom so the states of a row line up) or a mono readout (v2
// .module-tile__viz). A tag follows the title (v2 .sx-mod).
//
// Built on a bare <DmsAutoLink> rather than <ULink> on purpose: ULink's theme
// injects its own `rounded-md` which would override the .dms-card radius.
// The link is unstyled, so the shared .dms-card surface applies. Classes
// passed by the caller are merged (tailwind-merge), so `gap-2.5` replaces the
// default gap instead of competing with it.
interface NavCardProps {
  /** Route, `#anchor` or URL. */
  to: string;
  icon: string;
  title: string;
  description?: string;
  /** Tone of the icon well. */
  iconTone?: IconWellTone;
  /** Live state of the target, in mono under the description ("3 unread"). */
  state?: string;
  /** Tone of the state line (`neutral` = dimmed). */
  stateTone?: DmsTone;
  /** The state is still loading: a placeholder holds its line. */
  statePending?: boolean;
  /** Small uppercase mono tag after the title (module tag: "SAAS"). */
  badge?: string;
  /** Mono readout lines under the description (module tile). */
  readout?: string[];
}

defineOptions({ inheritAttrs: false });

const props = withDefaults(defineProps<NavCardProps>(), {
  description: undefined,
  iconTone: "accent",
  state: undefined,
  stateTone: "neutral",
  badge: undefined,
  readout: undefined,
});
const attrs = useAttrs();

const theme = tv({
  slots: {
    root: "dms-card dms-card--interactive group flex flex-col gap-3 p-[18px] text-start",
    title: "text-highlighted min-w-0 truncate text-sm font-[650]",
    badge:
      "bg-elevated shrink-0 text-dimmed rounded-[4px] px-1.5 font-mono text-[9.5px] font-semibold tracking-[0.08em] uppercase",
    arrow:
      "text-dimmed group-hover:text-primary ms-auto size-4 shrink-0 -translate-x-[3px] opacity-0 transition group-hover:translate-x-0 group-hover:opacity-100",
    description: "text-muted text-[13px] leading-normal",
    readout:
      "text-muted grid gap-0.5 font-mono text-[11.5px] leading-[1.55] font-medium",
  },
});

const ui = theme();
const rootClass = computed(() => ui.root({ class: attrs.class as string }));
const passthrough = computed(() => {
  const { class: _class, ...rest } = attrs;
  return rest;
});
</script>

<template>
  <DmsAutoLink :to="props.to" :class="rootClass" v-bind="passthrough">
    <div class="flex items-center gap-3">
      <DmsIconWell :icon="props.icon" :tone="props.iconTone" />
      <h3 :class="ui.title()">{{ props.title }}</h3>
      <span v-if="props.badge" :class="ui.badge()">{{ props.badge }}</span>
      <UIcon name="i-ph-arrow-right" :class="ui.arrow()" :aria-hidden="true" />
    </div>

    <p v-if="props.description" :class="ui.description()">
      {{ props.description }}
    </p>

    <div v-if="props.readout?.length" :class="ui.readout()">
      <span
        v-for="(line, index) in props.readout"
        :key="index"
        class="truncate"
      >
        {{ line }}
      </span>
    </div>

    <USkeleton
      v-if="props.statePending && !props.state"
      aria-hidden="true"
      class="mt-auto h-[18px] w-28 self-start"
    />
    <DmsStatusPill
      v-else-if="props.state"
      variant="text"
      dot="none"
      :tone="props.stateTone"
      :label="props.state"
      class="mt-auto self-start"
    />
  </DmsAutoLink>
</template>
