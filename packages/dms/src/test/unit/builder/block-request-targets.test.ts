import { expect } from "chai";
import type { JsonValue } from "@antelopejs/interface-dms/json";
import {
  addForm,
  ATTACKER_URL,
  call,
  CONNECT_CHECK,
  createShop,
  destroyShop,
  OP_TIMEOUT,
  PAGE,
  PAGE_FILE,
  PAGE_ROUTES,
  queryRoute,
  readShop,
  refusedPointers,
} from "./helpers/block-requests";

/** A POST load, a secret rotated at the connect check, a GET load, and row actions calling the connect check, running a script and opening a site. */
const NESTED_REQUESTS: JsonValue = [
  {
    name: "repair",
    type: "KpiCard",
    config: {
      title: "Repair",
      fetchUrl: "/api/builder/database/connections/repair",
      fetchUrlMethod: "POST",
    },
  },
  {
    name: "secret",
    type: "Form",
    config: {
      fields: [
        {
          id: "token",
          type: { $dataType: "secret", config: { rotateUrl: CONNECT_CHECK } },
        },
      ],
    },
  },
  {
    name: "reads",
    type: "KpiCard",
    config: { title: "Reads", fetchUrl: "/api/builder/database/connections" },
  },
  {
    name: "rows",
    type: "TableView",
    controller: "builder",
    config: {
      rowActions: {
        custom: [
          {
            label: "Check",
            target: {
              type: "api",
              url: CONNECT_CHECK,
              successMessage: "Checked",
            },
          },
          {
            label: "Run",
            target: { type: "external", url: " java\tscript:alert(1)" },
          },
          {
            label: "Site",
            target: { type: "external", url: "https://antelopejs.com" },
          },
          {
            label: "Filled",
            target: {
              type: "external",
              url: "java{{query.zz}}script:alert(1)",
            },
          },
          {
            label: "Email",
            target: { type: "external", url: "mailto:{{row.email}}" },
          },
          {
            label: "Call",
            target: { type: "external", url: "tel:{{row.phone}}" },
          },
        ],
      },
    },
  },
];

describe("[unit] a block the builder writes for an agent sends requests only to its page's data API", function () {
  this.timeout(OP_TIMEOUT);
  before(createShop);
  after(destroyShop);

  it("refuses a Form that submits to the assistant's database connect check, and writes nothing", async () => {
    const before = readShop(PAGE_FILE);
    expect(
      await refusedPointers(
        "builder_add_block",
        addForm("reconnect", {
          submitUrl: CONNECT_CHECK,
          submitUrlMethod: "POST",
          submitDefaults: ATTACKER_URL,
        }),
      ),
    ).to.deep.equal(["/config/submitUrl"]);
    expect(readShop(PAGE_FILE)).to.equal(before);
  });

  it("adds a Form that submits to a resource's DataAPI endpoint", async () => {
    for (const [name, submitUrl] of [
      ["newRow", "/api/builder/new"],
      ["editRow", "/api/builder/edit?id={{params.id}}"],
    ]) {
      const added = await call(
        "builder_add_block",
        addForm(name, { submitUrl }),
      );
      expect(added.isError, added.text).to.equal(undefined);
    }
    expect(readShop(PAGE_FILE)).to.include(
      "/api/builder/edit?id={{params.id}}",
    );
  });

  it("refuses a page route, even a query the page declares, and a path through a token, a dot segment or an escape", async () => {
    for (const submitUrl of [
      queryRoute(),
      `${PAGE_ROUTES}/members/invite`,
      `${PAGE_ROUTES}/../../../api/builder/database/connections/check`,
      `${PAGE_ROUTES}/{{query.a}}/{{query.b}}/{{query.c}}${CONNECT_CHECK}`,
      `${PAGE_ROUTES}/%2e%2e/%2e%2e/%2e%2e${CONNECT_CHECK}`,
      `//attacker.invalid${CONNECT_CHECK}`,
    ]) {
      expect(
        await refusedPointers(
          "builder_add_block",
          addForm("escape", { submitUrl }),
        ),
        submitUrl,
      ).to.deep.equal(["/config/submitUrl"]);
    }
  });

  it("refuses a patch that points an existing Form at the connect check", async () => {
    expect(
      await refusedPointers("builder_configure_block", {
        path: `${PAGE}#newRow`,
        patch: { submitUrl: CONNECT_CHECK, submitDefaults: ATTACKER_URL },
      }),
    ).to.deep.equal(["/patch/submitUrl"]);
    expect(readShop(PAGE_FILE)).to.not.include(CONNECT_CHECK);
  });

  it("refuses an API action and a non-GET load nested anywhere in the options, but not a GET load", async () => {
    expect(
      await refusedPointers("builder_compose_page", {
        pageRef: PAGE,
        blocks: NESTED_REQUESTS,
      }),
    ).to.deep.equal([
      "/blocks/0/config/fetchUrl",
      "/blocks/1/config/fields/0/type/config/rotateUrl",
      "/blocks/1",
      "/blocks/3/config/rowActions/custom/0/target/url",
      "/blocks/3/config/rowActions/custom/1/target/url",
      "/blocks/3/config/rowActions/custom/3/target/url",
    ]);
  });
  it("refuses a block name a path could not tell from a nested block", async () => {
    expect(
      await refusedPointers("builder_add_block", {
        page: PAGE,
        parent: `${PAGE}#rows`,
        name: "a/b",
        type: "KpiCard",
        config: { title: "Decoy" },
      }),
    ).to.deep.equal(["/name"]);
  });
});
