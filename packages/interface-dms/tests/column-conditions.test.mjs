import assert from "node:assert/strict";
import test from "node:test";
import { HTTPResult } from "@antelopejs/interface-api";
import { GetMetadata, ImplementInterface } from "@antelopejs/interface-core";
import { DataAPIMeta } from "@antelopejs/interface-data-api/metadata";
import { StringType } from "../dist/base/data-types/default/numbers.js";
import { fetchRowForGuard } from "../dist/base/table-view/data-functions.js";
import { withColumnConditions } from "../dist/base/table-view/internal/column-conditions.js";
import { TableViewMeta } from "../dist/base/table-view/meta.js";

/** @typedef {import("../dist/component-options/form-field.js").FieldCondition} FieldCondition */

const HTTP_BAD_REQUEST = 400;
const INHERITED = ["constructor", "toString", "valueOf", "hasOwnProperty"];
const WHEN_LOST = { field: "stage", in: ["lost"] };

/**
 * @param {Record<string, { visibleWhen?: FieldCondition; disabledWhen?: FieldCondition }>} conditions
 * @param {string[]} mandatoryOnNew
 */
const controllerWith = (conditions, mandatoryOnNew = []) => {
  class Controller {}
  const view = GetMetadata(Controller, TableViewMeta);
  const data = GetMetadata(Controller, DataAPIMeta);
  for (const [key, when] of Object.entries(conditions)) {
    view.setColumn(key, { type: new StringType(), ...when });
    data.field(key);
  }
  for (const key of mandatoryOnNew) {
    data.field(key).mandatory = new Set(["new"]);
  }
  return new Controller();
};

/** @param {string[]} fields */
const refusesFields = (fields) => (/** @type {unknown} */ error) =>
  error instanceof HTTPResult &&
  error.getStatus() === HTTP_BAD_REQUEST &&
  JSON.parse(error.getBody()).fields.join() === fields.join();

const recordingRoute = () => {
  /** @type {object[]} */
  const written = [];
  return {
    written,
    route: {
      func: async (
        /** @type {object} */ _ctx,
        /** @type {object} */ _params,
        /** @type {object} */ body,
      ) => {
        written.push(body);
      },
      args: [],
      method: "post",
    },
  };
};

/** @param {object} row */
const storedRow = (row) =>
  ImplementInterface(
    { fetchRowForGuard },
    { fetchRowForGuard: async () => row },
  );

await test("a column hidden by its condition leaves the body, and a stored value it held is cleared on edit", async () => {
  const controller = controllerWith({
    stage: {},
    reason: { visibleWhen: WHEN_LOST },
  });
  storedRow({ stage: "lost", reason: "price" });
  const { written, route } = recordingRoute();
  await withColumnConditions(route, "edit").func.call(
    controller,
    {},
    { id: "deal-1" },
    { stage: "open", reason: "ignored" },
  );
  assert.deepEqual(written, [{ stage: "open", reason: null }]);
});

await test("a visible mandatory column left empty is reported as missing", async () => {
  const controller = controllerWith(
    { stage: {}, reason: { visibleWhen: WHEN_LOST } },
    ["reason"],
  );
  const { written, route } = recordingRoute();
  await assert.rejects(
    withColumnConditions(route, "new").func.call(
      controller,
      {},
      {},
      { stage: "lost" },
    ),
    refusesFields(["reason"]),
  );
  assert.deepEqual(written, []);
});

for (const name of INHERITED) {
  await test(`a column named ${name} that the body lacks counts as empty when it is mandatory under a condition`, async () => {
    const controller = controllerWith(
      { stage: {}, [name]: { visibleWhen: WHEN_LOST } },
      [name],
    );
    const { written, route } = recordingRoute();
    await assert.rejects(
      withColumnConditions(route, "new").func.call(
        controller,
        {},
        {},
        { stage: "lost" },
      ),
      refusesFields([name]),
    );
    assert.deepEqual(written, []);
  });

  await test(`a condition reading ${name} sees a field the row lacks as empty`, async () => {
    const controller = controllerWith({
      stage: {},
      note: { disabledWhen: { field: name, in: [null] } },
    });
    const { written, route } = recordingRoute();
    await withColumnConditions(route, "new").func.call(
      controller,
      {},
      {},
      { stage: "open", note: "kept?" },
    );
    assert.deepEqual(written, [{ stage: "open" }]);
  });

  await test(`a hidden column named ${name} that the stored row lacks is not written as cleared`, async () => {
    const controller = controllerWith({
      stage: {},
      [name]: { visibleWhen: WHEN_LOST },
    });
    storedRow({ stage: "lost" });
    const { written, route } = recordingRoute();
    await withColumnConditions(route, "edit").func.call(
      controller,
      {},
      { id: "deal-1" },
      { stage: "open" },
    );
    assert.deepEqual(written, [{ stage: "open" }]);
  });
}
