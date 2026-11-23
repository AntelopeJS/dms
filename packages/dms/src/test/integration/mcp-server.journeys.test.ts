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

  it("bridge-calls-a-read-tool (fails when the stdio bridge does not relay builder_catalog's answer on an app the builder engine serves, or the catalog index loses its block types, DataTypes or reserved field names)", async () => {
    const answer = await callTool(session().bridge, "builder_catalog");

    expect(answer.isError, answer.text).to.equal(false);
    const catalog = CatalogIndexSchema.parse(JSON.parse(answer.text));
    expect(catalog.blocks.map(({ type }) => type)).to.include("TableView");
    expect(catalog.dataTypes.map(({ id }) => id)).to.include("string");
    expect(catalog.reservedFieldNames).to.include("_id");
  });
});

describe("[integration] mcp server journeys: the bridge files the harness's start with `mcpJson: false` publishes (`.mcp.json` is unit/mcp/project-files.test.ts's)", () => {
  it("bridge-files-published (fails when the start writes the credential readable beyond its owner, or for another route than the MCP one)", () => {
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
