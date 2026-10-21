// @vitest-environment node
/**
 * A create form leaves out the read-only fields the server fills once the
 * record exists.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { isHiddenOnCreate } from "../layers/dms-ui/app/build/composables/form/createFormFields";

const APP_DIR = resolve(__dirname, "../layers/dms-ui/app");
const source = (path: string) => readFileSync(join(APP_DIR, path), "utf8");

describe("a create form", () => {
  const field = { id: "openedAt", component: {}, disabled: true };

  it("leaves out a read-only field that holds nothing yet", () => {
    expect(isHiddenOnCreate(field, undefined)).toBe(true);
    expect(
      isHiddenOnCreate({ ...field, disabled: false, readonly: true }, ""),
    ).toBe(true);
  });

  it("shows it once it holds a value, or when it asks to", () => {
    expect(isHiddenOnCreate(field, "2026-10-20")).toBe(false);
    expect(isHiddenOnCreate({ ...field, showEmptyOnCreate: true }, null)).toBe(
      false,
    );
  });

  it("keeps every field that can be filled", () => {
    expect(isHiddenOnCreate({ ...field, disabled: false }, undefined)).toBe(
      false,
    );
  });

  it("applies only when the form creates a record", () => {
    expect(source("components/form/Form.vue")).toMatch(
      /return createsRecord && isHiddenOnCreate\(field, state\.value\[field\.id\]\);/,
    );
  });
});
