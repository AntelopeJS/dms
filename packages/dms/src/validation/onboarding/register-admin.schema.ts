import striptags from "striptags";
import * as z from "zod";

import { passwordSchema } from "../password";

const MAX_NAME_PART_LENGTH = 100;
const MAX_PLATFORM_NAME_LENGTH = 120;
const MAX_LANGUAGE_TAG_LENGTH = 35;
const LANGUAGE_TAG_PATTERN = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;

function withoutTags(value: string): string {
  return striptags(value).trim();
}

/** A name part that is still there once its HTML is stripped. */
const namePartSchema = z
  .string()
  .max(MAX_NAME_PART_LENGTH)
  .transform(withoutTags)
  .pipe(z.string().min(1));

/**
 * The first-run payload: the administrator account, whose first and last
 * name the form keeps apart and the user record stores as one display name,
 * and the platform details of the wizard's first step, both optional.
 */
export const onboardingRegisterAdminSchema = z
  .object({
    email: z.string().trim().email(),
    firstName: namePartSchema,
    lastName: namePartSchema,
    password: passwordSchema,
    platformName: z
      .string()
      .max(MAX_PLATFORM_NAME_LENGTH)
      .transform(withoutTags)
      .optional(),
    language: z
      .string()
      .max(MAX_LANGUAGE_TAG_LENGTH)
      .regex(LANGUAGE_TAG_PATTERN)
      .optional(),
  })
  .transform((data) => ({
    email: striptags(data.email),
    name: `${data.firstName} ${data.lastName}`,
    password: data.password,
    platformName: data.platformName || undefined,
    language: data.language,
  }));

/** A validated onboarding payload, as the register route receives it. */
export type OnboardingRegisterAdmin = z.output<
  typeof onboardingRegisterAdminSchema
>;
