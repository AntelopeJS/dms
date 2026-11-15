import fs from "node:fs";
import { fileURLToPath } from "node:url";
import semver from "semver";
import { z } from "zod";

const DMS_DEPENDENCY = /("@antelopejs\/interface-dms":\s*")([^"]*)(")/g;

const { version } = z
  .object({ version: z.string() })
  .parse(
    JSON.parse(
      fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ),
  );
const dmsPath = fileURLToPath(
  new URL("../../dms/package.json", import.meta.url),
);
const dmsText = fs.readFileSync(dmsPath, "utf8");
const range = z
  .object({
    dependencies: z.object({ "@antelopejs/interface-dms": z.string() }),
  })
  .parse(JSON.parse(dmsText)).dependencies["@antelopejs/interface-dms"];

const nextMinor = semver.inc(version, "minor");
if (!semver.satisfies(version, range) || semver.satisfies(nextMinor, range)) {
  const raised = `>=${version} <${nextMinor}`;
  fs.writeFileSync(
    dmsPath,
    dmsText.replace(
      DMS_DEPENDENCY,
      (_, head, __, tail) => head + raised + tail,
    ),
  );
}
