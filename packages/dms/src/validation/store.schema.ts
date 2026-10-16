import { z } from "zod";

const CATALOG_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const CATALOG_ID_MAX_LENGTH = 64;

/** A store operation names a catalog module, never a package. */
export const storeOperationSchema = z.object({
  id: z.string().max(CATALOG_ID_MAX_LENGTH).regex(CATALOG_ID_PATTERN),
});

/**
 * An npm package name, scoped or not: never a path, a URL or a git source,
 * so the store only installs from the registry.
 */
const NPM_PACKAGE_PATTERN =
  /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/;
const NPM_PACKAGE_MAX_LENGTH = 214;
const MAX_DEPENDENCIES = 20;

const npmPackageSchema = z
  .string()
  .max(NPM_PACKAGE_MAX_LENGTH)
  .regex(NPM_PACKAGE_PATTERN);

/**
 * An install, with the modules the owner picked for the interfaces the
 * release needs and nothing implements.
 */
export const storeInstallSchema = storeOperationSchema.extend({
  dependencies: z
    .array(
      z.object({
        interfacePackage: npmPackageSchema,
        package: npmPackageSchema,
        config: z.record(z.unknown()).optional(),
      }),
    )
    .max(MAX_DEPENDENCIES)
    .optional(),
});
