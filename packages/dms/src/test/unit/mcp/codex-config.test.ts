import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mock } from "node:test";
import { Logging } from "@antelopejs/interface-core/logging";
import { expect } from "chai";
import { parse } from "smol-toml";
import { z } from "zod";
import { publishBridge } from "../../../mcp/project-files";
import { readOptionalText } from "../../helpers/mcp";

const DMS_TABLE = `[mcp_servers.dms]
command = "node"
args = ["-e", "require('.cache/dms/mcp-bridge.cjs')"]
`;

const CodexServerSchema = z.object({
  mcp_servers: z.object({
    dms: z.object({ command: z.string(), args: z.array(z.string()) }),
  }),
});

describe("[unit] mcp codex config", () => {
  let projectPath: string;
  let configPath: string;
  let warn: ReturnType<typeof mock.method<typeof Logging, "Warn">>;

  beforeEach(async () => {
    projectPath = await mkdtemp(join(tmpdir(), "dms-mcp-codex-"));
    configPath = join(projectPath, ".codex", "config.toml");
    warn = mock.method(Logging, "Warn", () => undefined);
  });

  afterEach(async () => {
    warn.mock.restore();
    await rm(projectPath, { recursive: true, force: true });
  });

  async function publish(writeCodexConfig = true): Promise<void> {
    await publishBridge({
      projectPath,
      url: "http://127.0.0.1:5010/dms/mcp",
      token: "token",
      writeMcpJson: false,
      writeCodexConfig,
    });
  }

  async function writeConfig(content: string): Promise<void> {
    await mkdir(join(projectPath, ".codex"), { recursive: true });
    await writeFile(configPath, content);
  }

  it("creates .codex/config.toml with the dms server", async () => {
    await publish();
    expect(readOptionalText(configPath)).to.equal(DMS_TABLE);
  });

  it("appends the dms server after the settings, comments and servers already there", async () => {
    const authored =
      '# team settings\nmodel = "gpt-5"\n\n[mcp_servers.acme]\ncommand = "npx"';
    await writeConfig(authored);
    await publish();
    expect(readOptionalText(configPath)).to.equal(
      `${authored}\n\n${DMS_TABLE}`,
    );
  });

  it("leaves a dms server its author declared as it is, byte for byte", async () => {
    const authored = 'mcp_servers.dms.command = "bun"\n';
    await writeConfig(authored);
    await publish();
    expect(readOptionalText(configPath)).to.equal(authored);
  });

  for (const content of [
    "model = ",
    'mcp_servers = "none"\n',
    'mcp_servers = { acme = { command = "npx" } }\n',
  ]) {
    it(`leaves a file the dms table cannot extend alone, and warns: ${content}`, async () => {
      await writeConfig(content);
      await publish();
      expect(readOptionalText(configPath)).to.equal(content);
      expect(warn.mock.callCount()).to.equal(1);
    });
  }

  it("does not create .codex/config.toml when codexConfig is off", async () => {
    await publish(false);
    expect(readOptionalText(configPath)).to.equal(undefined);
  });

  it("launches the bridge launcher when Codex starts in a subdirectory of the project", async () => {
    await publish();
    const launcher = join(
      projectPath,
      "node_modules/.cache/dms/mcp-bridge.cjs",
    );
    await writeFile(launcher, "process.stdout.write(__filename);\n");
    const subdirectory = join(projectPath, "packages", "app");
    await mkdir(subdirectory, { recursive: true });
    const { dms } = CodexServerSchema.parse(
      parse(readOptionalText(configPath) ?? ""),
    ).mcp_servers;
    const output = execFileSync(dms.command, dms.args, {
      cwd: subdirectory,
      encoding: "utf8",
    });
    expect(output).to.equal(launcher);
  });
});
