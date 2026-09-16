<script setup lang="ts">
import { tv } from "tailwind-variants";
import type { ClassNameValue } from "tailwind-merge";

const theme = tv({
  slots: {
    root: "flex gap-4 items-start",
    badge:
      "rounded-lg bg-primary/10 shrink-0 ring ring-primary/20 flex items-center justify-center size-12",
    icon: "text-primary",

    content: "flex-1 min-w-0",
    // Design .page-head h1: 22px display, approximated with Tailwind's
    // leading-tight (1.25) and tracking-tight (-0.025em).
    title:
      "text-highlighted text-[22px] font-semibold leading-tight tracking-tight",
    description: "text-muted text-sm mt-1",
  },
});

interface PageHeaderProps {
  title: string;
  description?: string;
  icon?: string;

  class?: ClassNameValue;
  ui?: Partial<typeof theme.slots>;
}

const props = defineProps<PageHeaderProps>();
const themeStyles = computed(() => theme());

const { processI18n } = useTranslation();
</script>

<template>
  <section :class="themeStyles.root({ class: [props.class, props.ui?.root] })">
    <div
      v-if="props.icon"
      :class="themeStyles.badge({ class: props.ui?.badge })"
    >
      <UIcon
        :name="props.icon"
        :class="themeStyles.icon({ class: props.ui?.icon })"
        size="1.375rem"
      />
    </div>

    <div :class="themeStyles.content({ class: props.ui?.content })">
      <h1 :class="themeStyles.title({ class: props.ui?.title })">
        <slot name="title">
          {{ processI18n(props.title) }}
        </slot>
      </h1>
      <p
        v-if="props.description"
        :class="themeStyles.description({ class: props.ui?.description })"
      >
        <slot name="description">
          {{ processI18n(props.description) }}
        </slot>
      </p>
    </div>

    <slot name="actions" />
  </section>
</template>
