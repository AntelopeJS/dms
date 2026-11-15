import { expect } from "chai";
import type { JsonValue } from "@antelopejs/interface-dms/json";
import type { OpResult } from "@antelopejs/interface-dms-builder";
import {
  AddBlock,
  ComposePage,
  ConfigureBlock,
} from "../../../implementations/dms-builder";
import { expectOk } from "./harness";
import {
  addForm,
  ALLOWED_LOAD,
  ATTACKER_URL,
  call,
  CONNECT_CHECK,
  createShop,
  destroyShop,
  DRIFT_FILE,
  DRIFT_PAGE,
  FOREIGN_LOAD,
  OP_TIMEOUT,
  PAGE,
  PAGE_FILE,
  readShop,
  refusedPointers,
  writeShop,
} from "./helpers/block-requests";

/** A KpiCard loading `fetchUrl`, added by the engine as hand-written code would hold it. */
async function kpi(parent: string | undefined, name: string, fetchUrl: string) {
  const input: Parameters<typeof AddBlock>[0] = {
    page: DRIFT_PAGE,
    name,
    type: "KpiCard",
    config: { title: name, fetchUrl },
  };
  if (parent !== undefined) input.parent = parent;
  expectOk(await AddBlock(input), `AddBlock ${name}`);
}

/**
 * A tree whose names a path cannot tell apart: a child named `a/b` beside the
 * child `b` of `a`, the name `b` at the top and two levels down, and a child
 * named `grid` in `grid`. Each foreign load sits where a lookup by another
 * rule than the engine's would find an allowed one.
 */
async function createAwkwardTree(): Promise<void> {
  await kpi(undefined, "b", FOREIGN_LOAD);
  expectOk(
    await AddBlock({
      page: DRIFT_PAGE,
      name: "grid",
      type: "GridRow",
      config: {},
    }),
    "AddBlock grid",
  );
  await kpi(`${DRIFT_PAGE}#grid`, "a/b", ALLOWED_LOAD);
  expectOk(
    await AddBlock({
      page: DRIFT_PAGE,
      parent: `${DRIFT_PAGE}#grid`,
      name: "a",
      type: "GridRow",
      config: {},
    }),
    "AddBlock a",
  );
  await kpi(`${DRIFT_PAGE}#grid/a`, "b", FOREIGN_LOAD);
  await kpi(`${DRIFT_PAGE}#grid`, "grid", ALLOWED_LOAD);
}

/** The `fetchUrl` of the block the patch made a POST, when one is. */
function postedLoad(): string | undefined {
  const posting = [...readShop(DRIFT_FILE).matchAll(/KpiCard\(\{([^}]*)\}\)/g)]
    .map(([, options = ""]) => options)
    .find((options) => options.includes("fetchUrlMethod"));
  return posting === undefined
    ? undefined
    : /fetchUrl: "([^"]*)"/.exec(posting)?.[1];
}

/** The block the check judges is the block the engine changes, whatever the path's spelling. */
function driftCases(): void {
  before(createAwkwardTree);

  it("judges the block the engine writes the patch into", async () => {
    const seen = { written: 0, refusedWrite: 0 };
    for (const path of [
      "#grid/a/b",
      "#grid/a//b",
      "#grid//a/b/",
      "#b",
      "#grid/grid",
      "#grid/a",
      "#grid",
    ].map((at) => `${DRIFT_PAGE}${at}`)) {
      const saved = readShop(DRIFT_FILE);
      const patch = { fetchUrlMethod: "POST" };
      const answer = await call("builder_configure_block", { path, patch });
      if (answer.isError === true) {
        expect(readShop(DRIFT_FILE), path).to.equal(saved);
        if ((await ConfigureBlock(path, patch)).ok) {
          expect(postedLoad(), `${path} was refused`).to.equal(FOREIGN_LOAD);
          seen.refusedWrite += 1;
        }
      } else {
        expect(postedLoad(), `${path} was written`).to.not.equal(FOREIGN_LOAD);
        seen.written += 1;
      }
      writeShop(DRIFT_FILE, saved);
    }
    expect(seen.written, "paths the tool let through").to.be.greaterThan(0);
    expect(seen.refusedWrite, "paths the engine would write").to.be.greaterThan(
      0,
    );
  });
}

/** A block of `builder_compose_page` reading `endpoint` through a count query, its route written into `into`. */
function queried(
  name: string,
  type: string,
  config: Record<string, JsonValue>,
  endpoint: string,
  into?: string,
) {
  const query = {
    name: `${name}Query`,
    resource: "builder",
    template: "count",
    endpoint,
  };
  return {
    name,
    type,
    config,
    query: into === undefined ? query : { ...query, into },
  };
}

/** The cases where the engine, not the call, writes the URL. */
function engineWrittenCases(): void {
  it("refuses a composed query whose route the engine would write into a request option", async () => {
    const before = readShop(PAGE_FILE);
    expect(
      await refusedPointers("builder_compose_page", {
        pageRef: PAGE,
        blocks: [
          queried(
            "probeForm",
            "Form",
            {
              title: "Reconnect",
              submitUrlMethod: "POST",
              submitDefaults: ATTACKER_URL,
            },
            `/../../../..${CONNECT_CHECK}`,
            "submitUrl",
          ),
          queried(
            "probeCard",
            "KpiCard",
            { title: "Repair", fetchUrlMethod: "POST" },
            "/../../../../api/builder/database/connections/repair",
          ),
        ],
      }),
    ).to.deep.equal([
      "/blocks/0/config/submitUrl",
      "/blocks/1/config/fetchUrl",
    ]);
    expect(readShop(PAGE_FILE)).to.equal(before);
    const read = await call("builder_compose_page", {
      pageRef: PAGE,
      blocks: [
        queried(
          "titleCount",
          "KpiCard",
          { title: "Titles" },
          "/stats/title-count",
        ),
      ],
    });
    expect(read.isError, read.text).to.equal(undefined);
  });

  it("lets only one of two patches judged against the same page write", async () => {
    await call("builder_add_block", {
      page: PAGE,
      name: "raceCard",
      type: "KpiCard",
      config: { title: "Race", fetchUrl: ALLOWED_LOAD },
    });
    const path = `${PAGE}#raceCard`;
    const answers = await Promise.all([
      call("builder_configure_block", {
        path,
        patch: { fetchUrlMethod: "POST" },
      }),
      call("builder_configure_block", {
        path,
        patch: { fetchUrl: CONNECT_CHECK },
      }),
    ]);
    expect(
      answers.filter(({ isError }) => isError !== true),
    ).to.have.length.below(2);
    expect(readShop(PAGE_FILE)).to.not.match(
      new RegExp(`fetchUrl: "${CONNECT_CHECK}",\\s*fetchUrlMethod: "POST"`),
    );
  });
}

/** The cases that patch a block already on the page. */
function configureCases(): void {
  it("refuses a patch that turns a block's load into a write, one half at a time, whatever the path's spelling", async () => {
    await call("builder_add_block", {
      page: PAGE,
      name: "reads",
      type: "KpiCard",
      config: {
        title: "Reads",
        fetchUrl: "/api/builder/database/connections",
      },
    });
    for (const path of [`${PAGE}#reads`, `${PAGE}#reads/`, `${PAGE}#/reads`]) {
      expect(
        await refusedPointers("builder_configure_block", {
          path,
          patch: { fetchUrlMethod: "POST" },
        }),
        path,
      ).to.deep.equal(["/patch/fetchUrl"]);
    }
    expect(
      await refusedPointers("builder_configure_block", {
        path: `${PAGE}#missing`,
        patch: { fetchUrlMethod: "POST" },
      }),
    ).to.deep.equal(["/path"]);
    await call("builder_add_block", {
      page: PAGE,
      name: "posts",
      type: "KpiCard",
      config: {
        title: "Posts",
        fetchUrl: "/api/builder/list",
        fetchUrlMethod: "POST",
      },
    });
    expect(
      await refusedPointers("builder_configure_block", {
        path: `${PAGE}#posts`,
        patch: { fetchUrl: "/api/builder/database/connections/repair" },
      }),
    ).to.deep.equal(["/patch/fetchUrl"]);
  });

  it("edits a block its author pointed elsewhere when the patch leaves that URL alone", async () => {
    expectOk(
      await AddBlock(addForm("authored", { submitUrl: "/api/mailing/send" })),
      "AddBlock",
    );
    const edited = await call("builder_configure_block", {
      path: `${PAGE}#authored`,
      patch: { title: "Send" },
    });
    expect(edited.isError, edited.text).to.equal(undefined);
  });
}

/** The pointers of an engine refusal, failing when the operation was not refused. */
function enginePointers(answer: OpResult<unknown>): string[] {
  expect(answer.ok, JSON.stringify(answer)).to.equal(false);
  if (answer.ok || answer.error.code !== "invalid_config") {
    expect.fail(JSON.stringify(answer));
  }
  return answer.error.issues.map(({ pointer }) => pointer);
}

/** The engine's own entry points, called for an agent without the MCP tools in front. */
function entryPointCases(): void {
  it("AddBlock refuses a Form that submits to the connect check", async () => {
    const before = readShop(PAGE_FILE);
    expect(
      enginePointers(
        await AddBlock(
          addForm("direct", {
            submitUrl: CONNECT_CHECK,
            submitDefaults: ATTACKER_URL,
          }),
          { agent: true },
        ),
      ),
    ).to.deep.equal(["/config/submitUrl"]);
    expect(readShop(PAGE_FILE)).to.equal(before);
  });

  it("ConfigureBlock refuses a patch that turns a foreign load into a write", async () => {
    expectOk(
      await AddBlock({
        page: PAGE,
        name: "directLoad",
        type: "KpiCard",
        config: { title: "Direct", fetchUrl: FOREIGN_LOAD },
      }),
      "AddBlock directLoad",
    );
    const before = readShop(PAGE_FILE);
    expect(
      enginePointers(
        await ConfigureBlock(
          `${PAGE}#directLoad`,
          { fetchUrlMethod: "POST" },
          { agent: true },
        ),
      ),
    ).to.deep.equal(["/patch/fetchUrl"]);
    expect(readShop(PAGE_FILE)).to.equal(before);
  });

  it("ComposePage refuses a query whose route it would write into submitUrl", async () => {
    const before = readShop(PAGE_FILE);
    expect(
      enginePointers(
        await ComposePage(
          {
            page: PAGE,
            blocks: [
              queried(
                "directForm",
                "Form",
                { title: "Direct", kind: "action", fields: [] },
                "/stats/direct-count",
                "submitUrl",
              ),
            ],
          },
          { agent: true },
        ),
      ),
    ).to.deep.equal(["/blocks/0/config/submitUrl"]);
    expect(readShop(PAGE_FILE)).to.equal(before);
  });
}

describe("[unit] a block the builder writes for an agent is judged as the engine writes it", function () {
  this.timeout(OP_TIMEOUT);
  before(createShop);
  after(destroyShop);

  describe("through builder_configure_block", () => {
    configureCases();
  });
  describe("over block names a path cannot tell apart", () => {
    driftCases();
  });
  describe("where the engine writes the URL", () => {
    engineWrittenCases();
  });
  describe("through the engine's entry points", () => {
    entryPointCases();
  });
});
