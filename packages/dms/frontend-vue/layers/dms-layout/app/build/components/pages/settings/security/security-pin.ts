/**
 * Phone cells for the six-digit code inputs of the security modals: at
 * their v2 desktop size (38px and 42px wide) six cells outgrow a 320px
 * modal, so under `sm` they narrow to 32px with a 4px gap (v2 `.cs-otp`).
 */
export const PIN_PHONE_UI = {
  root: "max-sm:gap-1",
  base: "max-sm:w-8",
} as const;
