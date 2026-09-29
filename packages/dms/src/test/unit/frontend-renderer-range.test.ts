import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect } from "chai";
import { satisfies, validRange } from "semver";

const PACKAGE_ROOT = resolve(__dirname, "..", "..", "..");
const RENDERER_PACKAGE = "@antelopejs/dms-frontend";
const WORKSPACE_LOCKFILE = "../../pnpm-lock.yaml";
const LAYER_LOCKFILE = "frontend-vue/pnpm-lock.yaml";
/**
 * Where the renderer each layer runs on is locked: the workspace lockfile for
 * the playground, which loads both layers, and the layer's own lockfile, whose
 * renderer `pnpm --dir frontend-vue typecheck` compiles the layer against.
 */
const RENDERER_LOCKFILES_BY_LAYER: Record<string, string[]> = {
  "frontend-vue": [WORKSPACE_LOCKFILE, LAYER_LOCKFILE],
  "playground/frontend-vue": [WORKSPACE_LOCKFILE],
};
const LOCKED_RENDERER = /^ {2}'@antelopejs\/dms-frontend@([^'(]+)':$/gm;

interface LayerManifest {
  engines?: Record<string, string>;
}

function readRepositoryFile(relativePath: string): string {
  return readFileSync(resolve(PACKAGE_ROOT, relativePath), "utf8");
}

function declaredRange(layer: string): string | undefined {
  const manifest: LayerManifest = JSON.parse(
    readRepositoryFile(`${layer}/package.json`),
  );
  return manifest.engines?.[RENDERER_PACKAGE];
}

function lockedRenderers(lockfile: string): string[] {
  return [...readRepositoryFile(lockfile).matchAll(LOCKED_RENDERER)].map(
    ([, version]) => version,
  );
}

describe("[unit] frontend renderer range", () => {
  for (const [layer, lockfiles] of Object.entries(
    RENDERER_LOCKFILES_BY_LAYER,
  )) {
    it(`${layer} declares the renderer releases it supports`, () => {
      const range = declaredRange(layer);
      expect(range, `${layer}/package.json engines`).to.be.a("string");
      expect(validRange(range)).to.not.equal(null);
    });

    for (const lockfile of lockfiles) {
      it(`${layer} admits every renderer locked in ${lockfile}`, () => {
        const range = declaredRange(layer) ?? "";
        const locked = lockedRenderers(lockfile);
        expect(locked).to.not.deep.equal([]);
        for (const version of locked) {
          expect(
            satisfies(version, range),
            `${version} in "${range}"`,
          ).to.equal(true);
        }
      });
    }
  }
});
