import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { platform, tmpdir } from "node:os";
import { join } from "node:path";
import { expect } from "chai";
import { formatMcpJson, publishBridge } from "../../../mcp/project-files";
import {
  fileMode,
  readBridgeConfig,
  readOptionalText,
  windowsAccessEntries,
} from "../../helpers/mcp";

const URL = "http://127.0.0.1:5010/dms/mcp";
const TOKEN = "first-token";

const WRITTEN_FOR_EMPTY_PROJECT = `{
  "mcpServers": {
    "dms": {
      "command": "node",
      "args": ["node_modules/.cache/dms/mcp-bridge.cjs"]
    }
  }
}
`;

/** Each write starts Windows PowerShell up to twice, which a cold runner can take seconds to do. */
const WRITE_TIMEOUT_MS = platform() === "win32" ? 30_000 : 2_000;

describe("[unit] mcp project files", function () {
  this.timeout(WRITE_TIMEOUT_MS);
  let projectPath: string;
  let mcpJsonPath: string;

  beforeEach(async () => {
    projectPath = await mkdtemp(join(tmpdir(), "dms-mcp-project-"));
    mcpJsonPath = join(projectPath, ".mcp.json");
  });

  afterEach(async () => {
    await rm(projectPath, { recursive: true, force: true });
  });

  async function publish(writeMcpJson = true, token = TOKEN): Promise<void> {
    await publishBridge({
      projectPath,
      url: URL,
      token,
      writeMcpJson,
      writeCodexConfig: false,
    });
  }

  it("creates .mcp.json with the dms server, printed as the formatter prints it", async () => {
    await publish();
    expect(readOptionalText(mcpJsonPath)).to.equal(WRITTEN_FOR_EMPTY_PROJECT);
  });

  it("adds the dms server beside the other servers and keys, changing none of them", async () => {
    const other = { command: "npx", args: ["-y", "@acme/mcp"], env: {} };
    await writeFile(
      mcpJsonPath,
      JSON.stringify({ $schema: "x", mcpServers: { acme: other } }),
    );
    await publish();
    expect(JSON.parse(readOptionalText(mcpJsonPath) ?? "{}")).to.deep.equal({
      $schema: "x",
      mcpServers: {
        acme: other,
        dms: {
          command: "node",
          args: ["node_modules/.cache/dms/mcp-bridge.cjs"],
        },
      },
    });
  });

  it("leaves a dms entry its author wrote as it is, byte for byte", async () => {
    const authored = '{"mcpServers":{"dms":{"command":"bun","args":["x"]}}}';
    await writeFile(mcpJsonPath, authored);
    await publish();
    expect(readOptionalText(mcpJsonPath)).to.equal(authored);
  });

  for (const content of ["[1, 2]", '{"mcpServers": []}', "{ not json"]) {
    it(`leaves a file that is not a JSON object of servers alone: ${content}`, async () => {
      await writeFile(mcpJsonPath, content);
      await publish();
      expect(readOptionalText(mcpJsonPath)).to.equal(content);
    });
  }

  it("does not create .mcp.json when mcpJson is off, and still publishes the credential", async () => {
    await publish(false);
    expect(readOptionalText(mcpJsonPath)).to.equal(undefined);
    expect(readBridgeConfig(projectPath)).to.deep.equal({
      url: URL,
      token: TOKEN,
    });
  });

  it("publishes the route and credential", async () => {
    await publish();
    expect(readBridgeConfig(projectPath)).to.deep.equal({
      url: URL,
      token: TOKEN,
    });
  });

  it("publishes the route and credential readable by the project's user alone", async () => {
    await publish();
    const configPath = join(projectPath, "node_modules/.cache/dms/mcp.json");
    if (platform() === "win32") {
      const user = `${process.env.USERDOMAIN}\\${process.env.USERNAME}`;
      expect(windowsAccessEntries(configPath)).to.deep.equal([
        `${user}:(f)`.toLowerCase(),
      ]);
    } else {
      expect(fileMode(configPath)).to.equal(0o600);
    }
  });

  it("replaces the credential on the next start, so an old one stops working", async () => {
    await publish();
    await publish(true, "second-token");
    expect(readBridgeConfig(projectPath).token).to.equal("second-token");
  });

  it("writes a launcher that loads this build's bridge with the config beside it", async () => {
    await publish();
    const launcher = readOptionalText(
      join(projectPath, "node_modules/.cache/dms/mcp-bridge.cjs"),
    );
    expect(launcher).to.match(
      /^require\(".*(?:\/|\\\\)mcp(?:\/|\\\\)bridge\.js"\)\.runBridge\(/,
    );
    expect(launcher).to.include('"mcp.json"');
  });

  it("keeps a short array on one line and breaks one past the print width", () => {
    const long = Array.from({ length: 6 }, (_, index) => `--option-${index}`);
    expect(formatMcpJson({ args: ["a", "b"] })).to.equal(
      '{\n  "args": ["a", "b"]\n}',
    );
    expect(formatMcpJson({ args: long })).to.equal(
      JSON.stringify({ args: long }, null, 2),
    );
  });
});
