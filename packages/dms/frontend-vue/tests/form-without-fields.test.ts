/** @vitest-environment jsdom */
import { afterEach, expect, it } from "vitest";
import { host, mountForm, unmountForm } from "./helpers/form-runtime";

afterEach(unmountForm);

it("draws a form whose options carry no fields, as the block schema allows (fails when the form iterates absent fields and throws)", async () => {
  await mountForm({ fields: undefined });

  expect(host.querySelector("form")).not.toBeNull();
  expect(host.querySelectorAll("input")).toHaveLength(0);
});
