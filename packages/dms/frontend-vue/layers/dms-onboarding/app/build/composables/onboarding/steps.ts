/** The wizard steps, in order. */
export const ONBOARDING_STEPS = ["platform", "administrator", "ready"] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

/** What the first step collects about the platform. */
export interface OnboardingPlatform {
  name: string;
  language: string;
}

/** The owner account the second step created and signed in. */
export interface OnboardingAdministrator {
  name: string;
  email: string;
}
