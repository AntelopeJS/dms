import type { ButtonProps } from "@nuxt/ui";

/** How a page header's button looks: outline while neutral, solid in any other color. */
function defaultVariant(
  color: ButtonProps["color"] | undefined,
): ButtonProps["variant"] {
  return !color || color === "neutral" ? "outline" : "solid";
}

/**
 * The look of a button of the page header, whether the server serves it or a
 * mockup draws it: its color, its variant (by default the one `color` gets)
 * and its icon.
 */
export function headerButtonProps(look: {
  icon?: string;
  color?: ButtonProps["color"];
  variant?: ButtonProps["variant"];
}): Pick<ButtonProps, "color" | "variant" | "icon"> {
  const color = look.color ?? "neutral";
  return {
    color,
    variant: look.variant ?? defaultVariant(color),
    icon: look.icon,
  };
}
