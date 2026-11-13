import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mock } from "node:test";
import { Logging } from "@antelopejs/interface-core/logging";
import { expect } from "chai";
import {
  type McpBridgeTarget,
  publishMcpBridge,
} from "../../../mcp/project-files";
import { readBridgeConfig, readOptionalText } from "../../helpers/mcp";

const PUBLIC_API = "https://api.test.example.com";
const LOCAL_API = "http://127.0.0.1:5010";
const TOKEN = "start-token";
const CREDENTIAL_FILE = "node_modules/.cache/dms/mcp.json";
const LAUNCHER_FILE = "node_modules/.cache/dms/mcp-bridge.cjs";

describe("[unit] mcp bridge publication", () => {
  let projectPath: string;
  let warn: ReturnType<typeof mock.method<typeof Logging, "Warn">>;

  beforeEach(async () => {
    projectPath = await mkdtemp(join(tmpdir(), "dms-mcp-publish-"));
    warn = mock.method(Logging, "Warn", () => undefined);
  });

  afterEach(async () => {
    warn.mock.restore();
    await rm(projectPath, { recursive: true, force: true });
  });

  async function publish(
    apiBaseUrl: string,
    backendUrl?: string,
  ): Promise<void> {
    const target: McpBridgeTarget = {
      projectPath,
      token: TOKEN,
      writeMcpJson: true,
      backendUrl,
      apiBaseUrl,
      routePath: "/dms/mcp",
    };
    await publishMcpBridge(target);
  }

  function written(file: string): string | undefined {
    return readOptionalText(join(projectPath, file));
  }

  it("writes no credential, no launcher and no .mcp.json entry for a public apiBaseUrl without a backendUrl, and warns once naming mcp.backendUrl", async () => {
    await publish(PUBLIC_API);
    expect(written(CREDENTIAL_FILE)).to.equal(undefined);
    expect(written(LAUNCHER_FILE)).to.equal(undefined);
    expect(written(".mcp.json")).to.equal(undefined);
    expect(warn.mock.callCount()).to.equal(1);
    expect(String(warn.mock.calls[0]?.arguments[0])).to.contain(
      "mcp.backendUrl",
    );
  });

  it("writes the backendUrl into the bridge config, whatever apiBaseUrl is", async () => {
    await publish(PUBLIC_API, "http://127.0.0.1:5123/");
    expect(readBridgeConfig(projectPath)).to.deep.equal({
      url: "http://127.0.0.1:5123/dms/mcp",
      token: TOKEN,
    });
    expect(warn.mock.callCount()).to.equal(0);
  });

  it("falls back to a loopback apiBaseUrl when no backendUrl is set", async () => {
    await publish(`${LOCAL_API}/`);
    expect(readBridgeConfig(projectPath).url).to.equal(`${LOCAL_API}/dms/mcp`);
  });

  it("accepts each spelling of this machine's loopback, which the api module may publish", async () => {
    const spellings = [
      "http://localhost:5010",
      "http://127.0.0.2:5010",
      "http://[::1]:5010",
      "http://[::ffff:127.0.0.1]:5010",
      "https://127.0.0.1:5010",
    ];
    for (const spelling of spellings) {
      await publish(PUBLIC_API, spelling);
      expect(readBridgeConfig(projectPath).url, spelling).to.equal(
        `${spelling}/dms/mcp`,
      );
    }
  });

  it("writes no credential for a backendUrl that is not on this machine", async () => {
    await publish(LOCAL_API, PUBLIC_API);
    expect(written(CREDENTIAL_FILE)).to.equal(undefined);
    expect(warn.mock.callCount()).to.equal(1);
  });
});
