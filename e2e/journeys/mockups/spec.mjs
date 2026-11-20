import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fieldOf, itemsOf } from "../../mcp-bridge.mjs";

/**
 * @typedef {import("@antelopejs/dms/e2e").Ctx} Ctx
 */

const COMPILE_TIMEOUT_MS = 30_000;
const POLL_MS = 500;

/**
 * Writes a mockup's spec under the run's `mockups/`, which the development backend watches.
 *
 * @param {Ctx} ctx
 * @param {string} name
 * @param {{ title: string, categories?: unknown[], pages: unknown[] }} spec
 */
export function writeSpec(ctx, name, spec) {
  const folder = join(ctx.state.runPlayground ?? ctx.state.playground, "mockups", name);
  mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, "spec.json"), JSON.stringify({ version: 1, ...spec }));
}

/**
 * Waits until the backend compiled `count` pages of the mockup `name`.
 *
 * @param {Ctx} ctx
 * @param {string} name
 * @param {number} count
 */
export async function compiledPages(ctx, name, count) {
  const deadline = Date.now() + COMPILE_TIMEOUT_MS;
  for (;;) {
    const state = await ctx.api(`GET the ${name} mockup`, { method: "GET", path: `/api/mockup/${name}` });
    const pages = itemsOf(fieldOf(state.body, "pages"));
    if (pages.length === count || Date.now() > deadline) return pages.length;
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}
