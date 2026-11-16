import fc from "fast-check";
import type { JsonObject } from "./json";
import type { ShopBlock } from "./shop-project";

const FOREIGN_ROOTS = [
  "/api/builder/database/connections",
  "/dms/pages/shop/board",
  "/api/other",
  "/api/builder/new/extra",
  "/api/builder/../database/connections",
  "//attacker.invalid",
  "https://attacker.invalid",
];
const SCRIPT_LINKS = [
  "javascript:alert(1)",
  " java\tscript:alert(1)",
  "java{{query.zz}}script:alert(1)",
  "data:text/html,1",
  "vbscript:alert(1)",
];

/** A request URL no endpoint of the `builder` resource's data API is, by construction. */
function foreignUrl(): fc.Arbitrary<string> {
  return fc
    .tuple(
      fc.constantFrom(...FOREIGN_ROOTS),
      fc.stringMatching(/^(\/[a-z]{1,6}){0,2}$/),
      fc.constantFrom("", "?id=1", "?id={{params.id}}"),
    )
    .map(([root, tail, query]) => `${root}${tail}${query}`);
}

function secretField(url: string): JsonObject {
  return {
    fields: [
      {
        id: "token",
        type: { $dataType: "secret", config: { rotateUrl: url } },
      },
    ],
  };
}

function rowAction(target: JsonObject): JsonObject {
  return { rowActions: { custom: [{ label: "Go", target }] } };
}

/**
 * The options that send a block of the type of `base` outside its page's data API: a form's submit
 * or a secret's rotation, a data block's load sent as a write, a row action calling another API,
 * and a link that runs a script.
 */
export function badOptions(base: ShopBlock): fc.Arbitrary<JsonObject> {
  switch (base.type) {
    case "Form":
      return fc.oneof(
        foreignUrl().map((url) => ({
          submitUrl: url,
          submitUrlMethod: "POST",
        })),
        foreignUrl().map(secretField),
      );
    case "KpiCard":
      return fc
        .tuple(foreignUrl(), fc.constantFrom("POST", "PUT", "PATCH", "DELETE"))
        .map(([url, method]) => ({ fetchUrl: url, fetchUrlMethod: method }));
    default:
      return fc.oneof(
        foreignUrl().map((url) =>
          rowAction({ type: "api", url, successMessage: "Done" }),
        ),
        fc
          .constantFrom(...SCRIPT_LINKS)
          .map((url) => rowAction({ type: "external", url })),
      );
  }
}

/** Options that keep a block of the type of `base` inside its page's data API, each of which a tool must write. */
export function goodOptions(base: ShopBlock): JsonObject[] {
  switch (base.type) {
    case "Form":
      return [{ submitUrl: "/api/builder/new" }];
    case "KpiCard":
      return [{ fetchUrl: "/api/builder/count" }];
    default:
      return [rowAction({ type: "external", url: "https://antelopejs.com" })];
  }
}
