import { join } from "node:path";
import { platform } from "node:os";
import { expect } from "chai";
import { z } from "zod";
import { useBuilderSession } from "../helpers/builder-session";
import {
  fileMode,
  readBridgeConfig,
  windowsAccessEntries,
} from "../helpers/mcp";
import { callTool } from "../helpers/mcp-bridge-process";

const OP_TIMEOUT = 120_000;
const MODULE_ROOT = join(__dirname, "../../..");
const CREDENTIAL_FILE = join(MODULE_ROOT, "node_modules/.cache/dms/mcp.json");

const CatalogIndexSchema = z.object({
  blocks: z.array(z.object({ type: z.string() })),
  dataTypes: z.array(z.object({ id: z.string() })),
  reservedFieldNames: z.array(z.string()),
});

describe("[integration] mcp server journeys: a read tool through the bridge", function () {
  this.timeout(OP_TIMEOUT);
  const session = useBuilderSession();

  it("bridge-calls-a-read-tool (builder_catalog through the stdio bridge on an app the builder engine serves; fails when the bridge does not relay a tool's answer, or when the catalog index loses its block types, its DataTypes or the field names a resource may not use)", async () => {
    const answer = await callTool(session().bridge, "builder_catalog");

    expect(answer.isError, answer.text).to.equal(false);
    const catalog = CatalogIndexSchema.parse(JSON.parse(answer.text));
    expect(catalog.blocks.map(({ type }) => type)).to.include("TableView");
    expect(catalog.dataTypes.map(({ id }) => id)).to.include("string");
    expect(catalog.reservedFieldNames).to.include("_id");
  });
});

describe("[integration] mcp server journeys: the bridge files the start publishes", () => {
  it("bridge-files-published (the credential the harness's own start wrote for the bridge; fails when the start writes it readable beyond its owner, or names another route than the MCP one; the `.mcp.json` entry is `unit/mcp/project-files.test.ts`'s to check, as the harness starts with `mcpJson: false`)", () => {
    const { url, token } = readBridgeConfig();

    expect(new URL(url).pathname).to.equal("/dms/mcp");
    expect(token).to.not.equal("");
    if (platform() === "win32") {
      const user = `${process.env.USERDOMAIN}\\${process.env.USERNAME}`;
      expect(windowsAccessEntries(CREDENTIAL_FILE)).to.deep.equal([
        `${user}:(f)`.toLowerCase(),
      ]);
    } else {
      expect(fileMode(CREDENTIAL_FILE)).to.equal(0o600);
    }
  });
});
