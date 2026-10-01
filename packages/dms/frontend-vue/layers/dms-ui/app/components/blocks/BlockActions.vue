<script setup lang="ts">
import type { ButtonProps } from "@nuxt/ui";
import { buttonLinkProps } from "../../utils/link";
import type { DmsTone } from "../../utils/tone";

/** A link button a block option declares (interface-dms `BlockLinkAction`). */
export interface BlockAction {
  label: string;
  /** Route, `#anchor` or URL; an absolute URL opens in a new tab. */
  to: string;
  icon?: string;
  variant?: ButtonProps["variant"];
  color?: DmsTone;
}

// The link buttons of a display block (empty state, banner, card head). One
// action leads (`leadVariant` / `leadColor`): the first, or the last in a
// banner where the main action sits right-most. The others are quiet buttons,
// unless an action sets its own look. Labels follow the `$` i18n convention.
interface BlockActionsProps {
  actions: BlockAction[];
  size?: ButtonProps["size"];
  leadVariant?: ButtonProps["variant"];
  leadColor?: DmsTone;
  /** Look of the other actions. */
  restVariant?: ButtonProps["variant"];
  /** Which action leads. */
  leadPosition?: "first" | "last";
}

const props = withDefaults(defineProps<BlockActionsProps>(), {
  size: "sm",
  leadVariant: "solid",
  leadColor: "primary",
  restVariant: "outline",
  leadPosition: "first",
});

const { processI18n } = useTranslation();

function isLead(index: number): boolean {
  return props.leadPosition === "last"
    ? index === props.actions.length - 1
    : index === 0;
}

function buttonVariant(
  action: BlockAction,
  index: number,
): ButtonProps["variant"] {
  return (
    action.variant ?? (isLead(index) ? props.leadVariant : props.restVariant)
  );
}

function buttonColor(action: BlockAction, index: number): ButtonProps["color"] {
  const color = action.color ?? (isLead(index) ? props.leadColor : "neutral");
  return (color === "accent" ? "primary" : color) as ButtonProps["color"];
}
</script>

<template>
  <UButton
    v-for="(action, index) in props.actions"
    :key="`${index}-${action.to}`"
    :label="processI18n(action.label ?? '')"
    :icon="action.icon"
    :size="props.size"
    :variant="buttonVariant(action, index)"
    :color="buttonColor(action, index)"
    v-bind="buttonLinkProps(action.to)"
  />
</template>
