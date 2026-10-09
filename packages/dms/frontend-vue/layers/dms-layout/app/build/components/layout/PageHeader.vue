<script setup lang="ts">
import type { ClassNameValue } from "tailwind-merge";
import { type PageHeaderUi, pageHeaderTheme } from "./pageHeaderTheme";

interface PageHeaderProps {
  title: string;
  description?: string;
  icon?: string;

  class?: ClassNameValue;
  ui?: PageHeaderUi;
}

const props = defineProps<PageHeaderProps>();
const themeStyles = computed(() => pageHeaderTheme());

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
