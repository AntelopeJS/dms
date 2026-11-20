import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { fieldOf, parseJson, toolText } from "../mcp-bridge.mjs";

/**
 * @typedef {import("@antelopejs/dms/e2e").Ctx} Ctx
 */

/**
 * @param {import("../mcp-bridge.mjs").Session} session
 * @param {string} name The builder tool
 * @param {Record<string, unknown>} args Its arguments
 * @returns {Promise<{ ok: boolean, data: unknown, raw: string }>} Whether the operation succeeded, and what it answered
 */
export async function operation(session, name, args) {
  const answer = toolText(await session.call(name, args));
  const body = parseJson(answer.text);
  return { ok: !answer.isError && fieldOf(body, "ok") === true, data: fieldOf(body, "data"), raw: answer.text };
}

/**
 * Compiles the run's playground and restarts the backend on it, as `ajs project dev` does after the builder writes a file.
 *
 * @param {Ctx} ctx
 * @returns {Promise<{ passed: boolean, output: string }>} Whether the project compiled, and what the compiler said
 */
export async function rebuild(ctx) {
  const root = ctx.state.runPlayground ?? ctx.state.playground;
  const compiled = spawnSync(join(root, "node_modules", ".bin", "tsc"), [], { cwd: root, encoding: "utf8" });
  const output = `${compiled.stdout}${compiled.stderr}`;
  writeFileSync(join(ctx.step("compile the project"), "tsc.txt"), output);
  await ctx.restartBackend();
  return { passed: compiled.status === 0, output: output.slice(0, 400) };
}

/** The builder engine, driven through its MCP tools as a coding agent does. Its journeys run in `packages/dms/src/test/integration/builder.journeys.test.ts`. */
export const journeys = [];
