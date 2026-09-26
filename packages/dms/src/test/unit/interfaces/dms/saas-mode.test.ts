import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect } from "chai";
import {
  detectSaasMode,
  isSaasMode,
  resolveModulePackageName,
  type LoadedModuleOrigin,
  type LoadedModuleRegistry,
} from "@antelopejs/interface-dms/utils/saas-mode";

const SAAS_PACKAGE = "@antelopejs/dms-saas";
const MISSING_FOLDER = "/nonexistent/dms-saas-mode";

function packageOrigin(packageName: string): LoadedModuleOrigin {
  return {
    source: { type: "package", package: packageName, version: "1.0.0" },
    localPath: MISSING_FOLDER,
  };
}

function registryOf(
  origins: Record<string, LoadedModuleOrigin>,
): LoadedModuleRegistry {
  return {
    listModules: async () => Object.keys(origins),
    getModuleOrigin: async (moduleId) => {
      const origin = origins[moduleId];
      if (!origin) throw new Error(`Module not found: ${moduleId}`);
      return origin;
    },
  };
}

describe("[unit] SaaS mode detection", () => {
  let localModuleDir: string;

  before(() => {
    localModuleDir = mkdtempSync(join(tmpdir(), "dms-saas-mode-"));
    writeFileSync(
      join(localModuleDir, "package.json"),
      JSON.stringify({ name: SAAS_PACKAGE }),
    );
  });

  after(async () => {
    rmSync(localModuleDir, { recursive: true, force: true });
    await detectSaasMode();
  });

  it("recognises the SaaS package registered under a custom module id", async () => {
    await detectSaasMode(
      registryOf({
        api: packageOrigin("@antelopejs/api"),
        "dms-saas": packageOrigin(SAAS_PACKAGE),
      }),
    );
    expect(isSaasMode()).to.equal(true);
  });

  it("recognises a local SaaS module from its own manifest", async () => {
    await detectSaasMode(
      registryOf({
        saas: {
          source: { type: "local", path: localModuleDir },
          localPath: localModuleDir,
        },
      }),
    );
    expect(isSaasMode()).to.equal(true);
  });

  it("still recognises the SaaS package registered under its package name", async () => {
    const registry: LoadedModuleRegistry = {
      listModules: async () => [SAAS_PACKAGE],
      getModuleOrigin: async () => {
        throw new Error("no lookup expected");
      },
    };
    await detectSaasMode(registry);
    expect(isSaasMode()).to.equal(true);
  });

  it("stays off when no loaded module is the SaaS package", async () => {
    await detectSaasMode(
      registryOf({
        "dms-saas": packageOrigin("@acme/dms-saas"),
        dms: packageOrigin("@antelopejs/dms"),
      }),
    );
    expect(isSaasMode()).to.equal(false);
  });

  it("ignores a module that disappears between listing and lookup", async () => {
    const registry: LoadedModuleRegistry = {
      listModules: async () => ["gone"],
      getModuleOrigin: async () => {
        throw new Error("Module not found: gone");
      },
    };
    await detectSaasMode(registry);
    expect(isSaasMode()).to.equal(false);
  });

  it("resolves no package name for a local module without a manifest", async () => {
    const name = await resolveModulePackageName({
      source: { type: "local", path: MISSING_FOLDER },
      localPath: MISSING_FOLDER,
    });
    expect(name).to.equal(undefined);
  });

  it("is off in the test deployment, which loads no SaaS module", async () => {
    await detectSaasMode();
    expect(isSaasMode()).to.equal(false);
  });
});
