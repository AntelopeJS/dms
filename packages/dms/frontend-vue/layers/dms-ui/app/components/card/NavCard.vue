<script setup lang="ts">
// Navigation tile (design .settings-card): an icon pill + title + description
// rendered as a clickable card linking elsewhere (settings menu, etc.).
//
// Built on a bare <DmsLink> rather than <ULink> on purpose: ULink's theme
// injects its own `rounded-md` which would override the .dms-card radius.
// DmsLink is unstyled, so the shared .dms-card surface (rounded-xl) applies.
interface Props {
  to: string;
  icon: string;
  title: string;
  description?: string;
}

defineProps<Props>();
</script>

<template>
  <DmsLink
    :to="to"
    class="dms-card dms-card--interactive text-muted hover:text-default group flex flex-col gap-3 p-5 text-left"
  >
    <div class="flex items-center gap-3">
      <div
        class="bg-primary/10 ring-primary/20 group-hover:bg-primary/15 flex size-10 shrink-0 items-center justify-center rounded-lg ring transition-colors"
      >
        <UIcon :name="icon" class="text-primary size-5" :aria-hidden="true" />
      </div>

      <h3 class="text-highlighted min-w-0 truncate text-base font-semibold">
        {{ title }}
      </h3>

      <UIcon
        name="i-ph-caret-right"
        class="text-dimmed ml-auto size-4 shrink-0 opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100"
        :aria-hidden="true"
      />
    </div>

    <p v-if="description" class="text-dimmed text-sm leading-relaxed">
      {{ description }}
    </p>
  </DmsLink>
</template>
