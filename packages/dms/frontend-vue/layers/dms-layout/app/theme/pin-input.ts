/**
 * v2 code cells (`.au-otp`, `.cs-otp`): mono semibold digits on the field
 * surface, accent border plus halo on focus. Cells 28x32, 32x36, 38x44,
 * 42x48 and 46x52 (the sign-in code); `xl` also widens the gap.
 */
const PIN_FIELD =
  "bg-(--dms-bg-field) ring-accented shadow-(--shadow-xs) hover:ring-(--dms-field-border-hover)";

export const pinInputTheme = {
  slots: {
    root: "gap-1.5",
    base: "font-mono font-semibold text-highlighted tabular-nums rounded-lg disabled:opacity-50",
  },
  variants: {
    variant: {
      outline: PIN_FIELD,
      soft: "bg-elevated hover:bg-accented/60 focus:bg-(--dms-bg-field)",
      ghost: "hover:bg-elevated focus:bg-(--dms-bg-field)",
    },
    size: {
      xs: { base: "h-8 w-7 text-[13px]/4" },
      sm: { base: "h-9 w-8 text-[15px]/5" },
      md: { base: "h-11 w-[38px] text-lg/6" },
      lg: { base: "h-12 w-[42px] text-xl/6" },
      xl: {
        base: "h-[52px] w-[46px] rounded-[10px] text-[22px]/7 max-sm:h-[46px] max-sm:w-[38px]",
      },
    },
  },
  compoundVariants: [
    {
      color: "primary",
      variant: ["outline", "subtle", "soft", "ghost"],
      class: "outline-(--dms-accent-tint-strong)",
    },
    {
      color: "error",
      variant: ["outline", "subtle", "soft", "ghost"],
      class: "outline-(--dms-error-tint)",
    },
    { color: "primary", highlight: true, class: "hover:ring-primary" },
    { color: "error", highlight: true, class: "hover:ring-error" },
    { fixed: false, size: "xs", class: "md:text-[13px]" },
    { fixed: false, size: "sm", class: "md:text-[15px]" },
    { fixed: false, size: "md", class: "md:text-lg" },
    { fixed: false, size: "lg", class: "md:text-xl" },
    { fixed: false, size: "xl", class: "md:text-[22px]" },
    { size: "xl", class: { root: "gap-2 max-sm:gap-[5px]" } },
  ],
};
