import * as z from "zod";
import {
  PASSWORD_MIN_LENGTH,
  PASSWORD_PATTERN,
} from "@antelopejs/interface-dms/auth/password";

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH)
  .regex(PASSWORD_PATTERN);
