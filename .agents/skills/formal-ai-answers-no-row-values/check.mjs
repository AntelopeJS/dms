#!/usr/bin/env node
/**
 * Checks that no tool of the MCP registry answers a value of a connected
 * database's rows, and that every tool that writes refuses `{ $hidden }` sent
 * back: `packages/dms/src/test/formal/ai-answers-no-row-values.test.ts`, run
 * through the shared runner of `.agents/formal`. Exits 0 when it holds, 1 and
 * `BROKEN <tool>` when it does not, 2 when the build or the runner could not
 * run.
 *
 * @packageDocumentation
 */
import { runGeneratedCheck } from "../../formal/generated-check.mjs";

runGeneratedCheck("ai-answers-no-row-values.test.js");
