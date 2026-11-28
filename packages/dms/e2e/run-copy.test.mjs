import assert from "node:assert/strict";
import { existsSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { write } from "./helpers/repo.mjs";
import { layOutCopy } from "./run-copy.mjs";

/**
 * A checkout whose `e2e/playground` holds only its config and manifest, with
 * its modules installed at the checkout root, as cloud's is.
 *
 * @param {import("node:test").TestContext} t The test, which removes it
 * @returns {{ checkout: string, playground: string, root: string }} The checkout, its playground and where the copy goes
 */
function checkoutWithoutPlaygroundModules(t) {
  const dir = mkdtempSync(join(tmpdir(), "dms-e2e-run-copy-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const checkout = join(dir, "checkout");
  const playground = join(checkout, "e2e", "playground");
  write(join(playground, "antelope.config.ts"), "export default {};\n");
  write(join(playground, "package.json"), "{}\n");
  write(join(checkout, "node_modules", "some-module", "index.js"), "");
  return { checkout, playground, root: join(dir, "copy") };
}

await test("a playground with no node_modules of its own gets a copy that links nothing for it and resolves the checkout's modules (catches a copy that scans the missing folder, ENOENT in global setup)", (t) => {
  const { checkout, playground, root } = checkoutWithoutPlaygroundModules(t);

  const copy = layOutCopy(playground, checkout, root);

  assert.ok(existsSync(join(copy, "antelope.config.ts")));
  assert.equal(existsSync(join(copy, "node_modules")), false);
  assert.equal(
    realpathSync(join(root, "node_modules", "some-module")),
    realpathSync(join(checkout, "node_modules", "some-module")),
  );
});

await test("a playground with no node_modules of its own still serves the renderer checkout as @antelopejs/dms-frontend (catches a renderer link that needs the playground's modules)", (t) => {
  const { checkout, playground, root } = checkoutWithoutPlaygroundModules(t);
  const renderer = join(checkout, "..", "renderer");
  write(join(renderer, "package.json"), "{}\n");

  const copy = layOutCopy(playground, checkout, root, renderer);

  assert.equal(
    realpathSync(join(copy, "node_modules", "@antelopejs", "dms-frontend")),
    realpathSync(renderer),
  );
});
