import { dirname, join } from "node:path";
import { describeFailure } from "./failure.mjs";
import {
  buildInPreparedWorkspace,
  PREPARED_WORKSPACE_REFUSED,
} from "./frontend-workspace.mjs";

/**
 * Preloaded (`node --import`) into the `ajs dms build` that `up` runs in a
 * workspace it prepared: the build reads that workspace as it is, the
 * sources its key hashed, instead of copying them from the checkout again.
 * When it cannot, the process ends with {@link PREPARED_WORKSPACE_REFUSED}
 * before the build starts, and `up` builds as `ajs dms build` does.
 */
try {
  buildInPreparedWorkspace(join(dirname(process.argv[1] ?? ""), ".."));
} catch (error) {
  process.stderr.write(`dms-control: ${describeFailure(error)}\n`);
  process.exit(PREPARED_WORKSPACE_REFUSED);
}
