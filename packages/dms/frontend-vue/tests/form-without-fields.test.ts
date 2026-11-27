// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { host, mountForm, unmountForm } from "./helpers/form-runtime";

afterEach(unmountForm);

it("draws nothing for a form whose options carry no fields, as the block schema allows (fails when the form iterates absent fields and throws, or draws an empty card)", async () => {
  await mountForm({ fields: undefined }, undefined, undefined, () => true);
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(host.querySelector("form")).toBeNull();
  expect(host.querySelector("div")).toBeNull();
});
