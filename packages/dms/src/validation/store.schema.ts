import { z } from "zod";

const CATALOG_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const CATALOG_ID_MAX_LENGTH = 64;

/** A store operation names a catalog module, never a package. */
export const storeOperationSchema = z.object({
  id: z.string().max(CATALOG_ID_MAX_LENGTH).regex(CATALOG_ID_PATTERN),
});
