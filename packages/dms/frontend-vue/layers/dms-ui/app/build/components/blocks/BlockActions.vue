<script setup lang="ts">
import type { ButtonProps } from "@nuxt/ui";
import { buttonLinkProps } from "../../utils/link";
import type { Tone } from "../../../types/tone";
import type { CustomButton } from "../../../composables/table-view/types/custom-button";

/** A link button a block option declares (interface-dms `BlockLinkAction`). */
export interface BlockAction {
  label: string;
  /** Route, `#anchor` or URL; an absolute URL opens in a new tab. */
  to: string;
  icon?: string;
  variant?: ButtonProps["variant"];
  color?: Tone;
}

/**
 * A button running a target (interface-dms `BannerButtonAction`): the block
 * that offers it runs it on `press`, with its confirmation.
 */
export interface BlockButtonAction
  extends Pick<CustomButton, "label" | "icon" | "target" | "confirm"> {
  variant?: ButtonProps["variant"];
  color?: Tone;
}

/** A link or a button a block offers. */
export type BlockActionItem = BlockAction | BlockButtonAction;

// The buttons of a display block (empty state, banner, card head): links, and
// in a banner, buttons running a target, which the block runs on `press`. One
// action leads (`leadVariant` / `leadColor`): the first, or the last in a
// banner where the main action sits right-most. The others are quiet buttons,
// unless an action sets its own look. Labels follow the `$` i18n convention.
interface BlockActionsProps {
  actions: BlockActionItem[];
  size?: ButtonProps["size"];
  leadVariant?: ButtonProps["variant"];
  leadColor?: Tone;
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

const emit = defineEmits<{ press: [action: BlockButtonAction] }>();

const { processI18n } = useTranslation();

const isButtonAction = (action: BlockActionItem): action is BlockButtonAction =>
  "target" in action && Boolean(action.target);

function actionProps(action: BlockActionItem): Record<string, unknown> {
  if (!isButtonAction(action)) return buttonLinkProps(action.to);
  return { onClick: () => emit("press", action) };
}

function isLead(index: number): boolean {
  return props.leadPosition === "last"
    ? index === props.actions.length - 1
    : index === 0;
}

function buttonVariant(
  action: BlockActionItem,
  index: number,
): ButtonProps["variant"] {
  return (
    action.variant ?? (isLead(index) ? props.leadVariant : props.restVariant)
  );
}

function buttonColor(
  action: BlockActionItem,
  index: number,
): ButtonProps["color"] {
  return action.color ?? (isLead(index) ? props.leadColor : "neutral");
}
</script>

<template>
  <UButton
    v-for="(action, index) in props.actions"
    :key="`${index}-${action.label}`"
    :label="processI18n(action.label ?? '')"
    :icon="action.icon"
    :size="props.size"
    :variant="buttonVariant(action, index)"
    :color="buttonColor(action, index)"
    v-bind="actionProps(action)"
  />
</template>
