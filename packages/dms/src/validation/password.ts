import * as z from "zod";

export const PASSWORD_REGEX =
  /^(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]+$/;

export const passwordSchema = z.string().min(8).regex(PASSWORD_REGEX);
