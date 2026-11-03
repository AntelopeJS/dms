import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import test from "node:test";
import { setFlagsFromString } from "node:v8";
import { runInNewContext } from "node:vm";
import { HTTPResult } from "@antelopejs/interface-api";
import { z } from "zod";
import {
  RegisterInviteExtension,
  internal,
} from "../dist/invite-extensions/registry.js";
import {
  applyInviteExtension,
  revokeInviteExtension,
  clearInviteExtensions,
} from "../dist/invite-extensions/internal/registry.js";
import { CollectInviteExtensionPayloads } from "../dist/invite-extensions/internal/delivery.js";
import { CollectInviteExtensionEdits } from "../dist/invite-extensions/internal/edit.js";

internal.RegisterInviteExtension.onHandlers(
  applyInviteExtension,
  revokeInviteExtension,
);

const BOUND = 64;
const BODY_BYTES = 1024 * 1024;
const MAX_MS = 2000;
const MAX_RSS_MB = 512;
const KB_PER_MB = 1024;

/**
 * Peak resident set size of this test file's process, in MB. Each test file
 * runs in its own process under `node --test`, so the peak is this file's.
 */
function peakRssMb() {
  return process.resourceUsage().maxRSS / KB_PER_MB;
}

/**
 * @param {string} text
 * @returns {unknown}
 */
function parse(text) {
  /** @type {unknown} */
  const value = JSON.parse(text);
  return value;
}

/**
 * @param {"array" | "object"} kind
 * @param {number} containers
 * @returns {string}
 */
function element(kind, containers) {
  return kind === "array"
    ? "[".repeat(containers) + "]".repeat(containers)
    : '{"a":'.repeat(containers) + "1" + "}".repeat(containers);
}

/**
 * About 1 MiB of JSON: an array of elements, each nested `containers` levels
 * deep, so held by a field of the body it is `containers + 2` levels deep. The
 * first element may be nested differently from the rest.
 *
 * @param {{ kind: "array" | "object", containers: number, firstContainers?: number }} shape
 * @returns {string}
 */
function wideArray({ kind, containers, firstContainers = containers }) {
  const each = element(kind, containers);
  const head = `[${element(kind, firstContainers)}`;
  const count = Math.floor((BODY_BYTES - head.length - 1) / (each.length + 1));
  return `${head}${`,${each}`.repeat(count)}]`;
}

/**
 * About 1 MiB of JSON: many fields, each holding one element nested
 * `containers` levels deep, so the body is `containers + 1` levels deep.
 *
 * @param {{ kind: "array" | "object", containers: number }} shape
 * @returns {string}
 */
function manyFieldsBody({ kind, containers }) {
  const each = element(kind, containers);
  const fields = [];
  let size = 2;
  for (let index = 0; size + each.length < BODY_BYTES; index += 1) {
    const field = `"billing__f${index}":${each}`;
    fields.push(field);
    size += field.length + 1;
  }
  return `{${fields.join(",")}}`;
}

/**
 * A field value nested `levels - 1` arrays deep, so held by a field of the
 * body it is `levels` deep.
 *
 * @param {number} levels
 * @returns {string}
 */
function chain(levels) {
  return element("array", levels - 1);
}

setFlagsFromString("--expose-gc");

function collectGarbage() {
  runInNewContext("gc()");
}

const WIDE_ENTRIES = 200_000;

function registerBilling() {
  collectGarbage();
  clearInviteExtensions();
  RegisterInviteExtension({
    key: "billing",
    component: {},
    schema: z.unknown(),
    onAccept() {},
  });
}

/**
 * @param {() => unknown} run
 * @returns {{ result: unknown, failure: unknown, ms: number }}
 */
function timed(run) {
  const start = performance.now();
  try {
    return { result: run(), failure: undefined, ms: performance.now() - start };
  } catch (failure) {
    return { result: undefined, failure, ms: performance.now() - start };
  }
}

/** @param {{ failure: unknown, ms: number }} outcome */
function assertRefusedInTime({ failure, ms }) {
  assert.ok(failure instanceof HTTPResult, `got ${String(failure)}`);
  assert.equal(failure.status, 400);
  assert.match(
    String(failure.body),
    new RegExp(`more than ${BOUND} levels deep`),
  );
  assertWithinBounds(ms);
}

/** @param {number} ms */
function assertWithinBounds(ms) {
  assert.ok(ms < MAX_MS, `took ${ms.toFixed(0)} ms, bound ${MAX_MS} ms`);
  const peak = peakRssMb();
  assert.ok(
    peak < MAX_RSS_MB,
    `peak RSS ${peak.toFixed(0)} MB, bound ${MAX_RSS_MB} MB`,
  );
}

/**
 * @param {unknown} note
 * @returns {string}
 */
function storedAs(note) {
  return JSON.stringify({ billing: { note } });
}

const flows = [
  { flow: "payloads", collect: CollectInviteExtensionPayloads },
  { flow: "edits", collect: CollectInviteExtensionEdits },
];

for (const { flow, collect } of flows) {
  for (const kind of /** @type {const} */ (["array", "object"])) {
    await test(`${flow}: a ${BODY_BYTES}-byte body of ${BOUND - 1}-deep ${kind} elements, ${BOUND + 1} levels with the body counted, answers 400 in time and in memory`, () => {
      registerBilling();
      const body = {
        billing__note: parse(wideArray({ kind, containers: BOUND - 1 })),
      };

      assertRefusedInTime(timed(() => collect(body)));
    });

    await test(`${flow}: a ${BODY_BYTES}-byte body of ${BOUND}-deep ${kind} elements, ${BOUND} levels with the body counted, is accepted whole in time and in memory`, () => {
      registerBilling();
      const note = parse(wideArray({ kind, containers: BOUND - 2 }));

      const outcome = timed(() => collect({ billing__note: note }));

      assert.equal(outcome.failure, undefined);
      assert.equal(JSON.stringify(outcome.result), storedAs(note));
      assertWithinBounds(outcome.ms);
    });
  }

  await test(`${flow}: one ${BOUND + 1}-deep element met after every ${BOUND}-deep one answers 400 in time and in memory`, () => {
    registerBilling();
    const body = {
      billing__note: parse(
        wideArray({
          kind: "array",
          containers: BOUND - 2,
          firstContainers: BOUND - 1,
        }),
      ),
    };

    assertRefusedInTime(timed(() => collect(body)));
  });

  await test(`${flow}: a ${BODY_BYTES}-byte body of many fields ${BOUND} levels deep is accepted and ${BOUND + 1} levels answer 400, in time and in memory`, () => {
    registerBilling();
    const allowed = parse(
      manyFieldsBody({ kind: "array", containers: BOUND - 1 }),
    );
    const refused = parse(manyFieldsBody({ kind: "array", containers: BOUND }));

    const accepted = timed(() => collect(allowed));
    assert.equal(accepted.failure, undefined);
    assertWithinBounds(accepted.ms);
    assertRefusedInTime(timed(() => collect(refused)));
  });

  await test(`${flow}: the same wide and deep body under a field no extension owns is walked just as fast`, () => {
    registerBilling();
    const allowed = {
      unrelated: parse(wideArray({ kind: "array", containers: BOUND - 2 })),
    };
    const refused = {
      unrelated: parse(wideArray({ kind: "array", containers: BOUND - 1 })),
    };

    const accepted = timed(() => collect(allowed));
    assert.equal(accepted.failure, undefined);
    assertWithinBounds(accepted.ms);
    assertRefusedInTime(timed(() => collect(refused)));
  });

  await test(`${flow}: a ${BODY_BYTES}-byte flat body of scalars is accepted in time and in memory`, () => {
    registerBilling();
    const scalars = Array(Math.floor(BODY_BYTES / 2) - 20)
      .fill("1")
      .join(",");

    const outcome = timed(() =>
      collect({ billing__note: parse(`[${scalars}]`) }),
    );

    assert.equal(outcome.failure, undefined);
    assertWithinBounds(outcome.ms);
  });

  for (const levels of [BOUND + 1, 10_000]) {
    await test(`${flow}: a single chain ${levels} levels deep answers 400`, () => {
      registerBilling();
      const body = { billing__note: parse(chain(levels)) };

      assertRefusedInTime(timed(() => collect(body)));
    });
  }

  await test(`${flow}: a single chain ${BOUND} levels deep is accepted`, () => {
    registerBilling();
    const note = parse(chain(BOUND));

    const outcome = timed(() => collect({ billing__note: note }));

    assert.equal(outcome.failure, undefined);
    assert.equal(JSON.stringify(outcome.result), storedAs(note));
  });

  await test(`${flow}: ${WIDE_ENTRIES} entries in one array are accepted in time and in memory`, () => {
    registerBilling();
    const note = parse(`[${Array(WIDE_ENTRIES).fill("1").join(",")}]`);

    const outcome = timed(() => collect({ billing__note: note }));

    assert.equal(outcome.failure, undefined);
    assert.equal(JSON.stringify(outcome.result), storedAs(note));
    assertWithinBounds(outcome.ms);
  });

  await test(`${flow}: ${WIDE_ENTRIES} entries in one object are accepted in time and in memory`, () => {
    registerBilling();
    const entries = Array.from(
      { length: WIDE_ENTRIES },
      (_, index) => `"k${index}":1`,
    );
    const note = parse(`{${entries.join(",")}}`);

    const outcome = timed(() => collect({ billing__note: note }));

    assert.equal(outcome.failure, undefined);
    assert.equal(JSON.stringify(outcome.result), storedAs(note));
    assertWithinBounds(outcome.ms);
  });

  await test(`${flow}: ${WIDE_ENTRIES} fields in the body itself are accepted in time and in memory`, () => {
    registerBilling();
    const entries = Array.from(
      { length: WIDE_ENTRIES },
      (_, index) => `"billing__f${index}":[${index}]`,
    );
    const body = parse(`{${entries.join(",")}}`);

    const outcome = timed(() => collect(body));

    assert.equal(outcome.failure, undefined);
    assertWithinBounds(outcome.ms);
  });
}
