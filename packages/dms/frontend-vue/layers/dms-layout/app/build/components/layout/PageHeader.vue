<script setup lang="ts">
import { tv } from "tailwind-variants";
import type { ClassNameValue } from "tailwind-merge";

const theme = tv({
  slots: {
    root: "flex gap-3.5 items-start",
    badge:
      "mt-px rounded-[9px] bg-primary/10 shrink-0 ring ring-inset ring-primary/35 flex items-center justify-center size-9",
    icon: "text-primary",

    content: "flex-1 min-w-0",
    // v2 .page-header__title: 24px, weight 650, line-height 1.2, -0.03em.
    title:
      "text-highlighted text-2xl font-[650] leading-[1.2] tracking-[-0.03em]",
    description: "text-muted text-sm mt-1 max-w-[68ch]",
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
        size="1.1875rem"
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
