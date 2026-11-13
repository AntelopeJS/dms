import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { raisedDmsRange, withDmsRange } from "../../../checks/dms-range.mjs";

const interfaceManifest = z
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
const dmsManifest = z
  .object({
    dependencies: z.object({ "@antelopejs/interface-dms": z.string() }),
  })
  .parse(JSON.parse(dmsText));

const raised = raisedDmsRange(
  interfaceManifest.version,
  dmsManifest.dependencies["@antelopejs/interface-dms"],
);
if (raised !== undefined)
  fs.writeFileSync(dmsPath, withDmsRange(dmsText, raised));
