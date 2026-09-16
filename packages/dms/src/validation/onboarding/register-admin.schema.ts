import striptags from "striptags";
import * as z from "zod";

import { passwordSchema } from "../password";

export const onboardingRegisterAdminSchema = z
  .object({
    email: z.string().trim().email(),
    name: z.string().trim().min(1),
    password: passwordSchema,
  })
  .transform((data) => ({
    email: striptags(data.email),
    name: striptags(data.name),
    password: data.password,
  }));
