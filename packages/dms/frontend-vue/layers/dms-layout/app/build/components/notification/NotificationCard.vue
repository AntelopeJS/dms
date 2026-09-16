<script lang="ts">
export const CARD_MODE = {
  CARD: "card",
  LIST: "list",
  LIST_TOP: "list-top",
  LIST_BOTTOM: "list-bottom",
  BORDERLESS: "borderless",
} as const;

export type CardMode = (typeof CARD_MODE)[keyof typeof CARD_MODE];
</script>

<script setup lang="ts">
interface CardProps {
  clickable?: boolean;
  dimmed?: boolean;
  to?: string;
  mode?: CardMode;
  actionsOnHover?: boolean;
}

const props = withDefaults(defineProps<CardProps>(), {
  clickable: false,
  dimmed: false,
  mode: CARD_MODE.CARD,
  actionsOnHover: false,
});

const emit = defineEmits<{
  click: [];
}>();

const cardClasses = computed(() => {
  const classes = [];

  if (props.clickable || props.to) {
    classes.push("cursor-pointer hover:bg-muted/50 transition-colors");
  }

  if (props.dimmed) {
    classes.push("opacity-60");
  }

  if (props.actionsOnHover) {
    classes.push("group");
  }

  return classes.join(" ");
});

const actionsClasses = computed(() =>
  props.actionsOnHover
    ? "opacity-0 group-hover:opacity-100 transition-opacity"
    : "",
);

const CARD_MODE_STYLES: Record<CardMode, string> = {
  [CARD_MODE.CARD]: "mb-3",
  [CARD_MODE.LIST]:
    "bg-transparent ring-0 rounded-none border-b border-default",
  [CARD_MODE.LIST_TOP]:
    "bg-transparent ring-0 rounded-none border-t border-default",
  [CARD_MODE.LIST_BOTTOM]:
    "bg-transparent ring-0 rounded-none border-b border-default",
  [CARD_MODE.BORDERLESS]: "bg-transparent ring-0 rounded-none",
};

const cardUi = computed(() => ({
  body: "sm:p-4",
  root: CARD_MODE_STYLES[props.mode],
}));

const handleClick = () => {
  if (props.to) {
    navigateDms(props.to);
  }
  emit("click");
};
</script>

<template>
  <UCard :ui="cardUi" :class="cardClasses" @click="handleClick">
    <div class="flex items-start gap-3">
      <slot name="icon" />

      <div class="min-w-0 flex-1">
        <slot name="title" />
        <slot name="description" />
        <slot name="footer" />
      </div>

      <slot name="meta" />

      <div :class="actionsClasses">
        <slot name="actions" />
      </div>
    </div>
  </UCard>
</template>
