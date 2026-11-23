#!/usr/bin/env node
/**
 * Checks that every tool of the MCP registry that persists block options
 * refuses a block that sends requests outside its page's data API, and writes
 * nothing: `packages/dms/src/test/formal/block-writes-judge-request-targets.test.ts`,
 * run through the shared runner of `.agents/formal`. Exits 0 when it holds, 1
 * and `BROKEN <tool>` when it does not, 2 when the build or the runner could
 * not run.
 *
 * @packageDocumentation
 */
import { runGeneratedCheck } from "../../formal/generated-check.mjs";

runGeneratedCheck("block-writes-judge-request-targets.test.js");
