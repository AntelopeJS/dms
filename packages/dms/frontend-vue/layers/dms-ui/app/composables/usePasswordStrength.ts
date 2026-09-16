import { z } from "zod";
import type { Ref, ComputedRef } from "vue";

export interface PasswordRequirement {
  met: boolean;
  text: string;
}

const MIN_PASSWORD_LENGTH = 8;
const ALLOWED_SPECIAL_CHARS = "@$!%*?&";
const ALLOWED_CHARS_REGEX = /^[A-Za-z\d@$!%*?&]+$/;

const PASSWORD_REQUIREMENTS = [
  { regex: /.{8,}/, messageKey: "form.password_strength.min" },
  { regex: /[A-Z]/, messageKey: "form.password_strength.upercase" },
  { regex: /\d/, messageKey: "form.password_strength.number" },
  {
    regex: /[@$!%*?&]/,
    messageKey: "form.password_strength.special",
    suffix: ` (${ALLOWED_SPECIAL_CHARS})`,
  },
  {
    regex: ALLOWED_CHARS_REGEX,
    messageKey: "form.password_strength.allowed_only",
  },
];

const SCORE_THRESHOLDS = {
  error: 1,
  warning: 4,
} as const;

type StrengthColor =
  | "error"
  | "primary"
  | "secondary"
  | "success"
  | "info"
  | "warning"
  | "neutral";

export const passwordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH, { message: "" })
  .regex(/[A-Z]/, { message: "" })
  .regex(/\d/, { message: "" })
  .regex(/[@$!%*?&]/, { message: "" })
  .regex(ALLOWED_CHARS_REGEX, { message: "" });

export function usePasswordStrength(password: Ref<string>) {
  const { t } = useI18n();

  const strength: ComputedRef<PasswordRequirement[]> = computed(() =>
    PASSWORD_REQUIREMENTS.map((req) => ({
      met: req.regex.test(password.value || ""),
      text: t(req.messageKey) + (req.suffix ?? ""),
    })),
  );

  const score: ComputedRef<number> = computed(
    () => strength.value.filter((req) => req.met).length,
  );

  const color: ComputedRef<StrengthColor> = computed(() => {
    if (score.value <= SCORE_THRESHOLDS.error) return "error";
    if (score.value <= SCORE_THRESHOLDS.warning) return "warning";
    return "success";
  });

  return { strength, score, color, passwordSchema };
}
