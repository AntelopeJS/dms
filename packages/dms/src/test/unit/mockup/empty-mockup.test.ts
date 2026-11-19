import { Readable } from "node:stream";
import Ajv2020 from "ajv/dist/2020";
import type { AxiosInstance } from "axios";
import { expect } from "chai";
import { z } from "zod";
import {
  compileSpec,
  MAX_PAGES,
  mockupNameSchema,
  parseSpec,
} from "../../../mockup";
import {
  MOCKUP_API as BASE,
  serveMockupRoutes,
} from "../../helpers/mockup-routes";
import { MOCKUP_SPEC_SCHEMA } from "../../helpers/mockup-spec-schema";

const EMPTY = JSON.stringify({ version: 1, title: "Not yet", pages: [] });

const summarySchema = z.object({
  results: z.array(
    z.object({ name: z.string(), pages: z.number(), status: z.string() }),
  ),
  total: z.number(),
});

describe("[unit] mockup with no page", () => {
  const served = serveMockupRoutes(EMPTY);
  let owner: AxiosInstance;

  before(() => {
    ({ owner } = served());
  });

  it("parses and compiles to no page and no issue", () => {
    const read = parseSpec(EMPTY);
    if (!read.ok) throw new Error(JSON.stringify(read.issues));
    const compiled = compileSpec(mockupNameSchema.parse("desk"), read.spec);

    expect(compiled.pages).to.deep.equal([]);
    expect(compiled.issues).to.deep.equal([]);
    expect(compiled.title).to.equal("Not yet");
  });

  it("still refuses more pages than the limit", () => {
    const pages = Array.from({ length: MAX_PAGES + 1 }, (_, index) => ({
      id: `p${index}`,
      title: "P",
      tree: [],
    }));
    const read = parseSpec(JSON.stringify({ version: 1, pages }));

    expect(read.ok).to.equal(false);
  });

  it("serves the state of the mockup with no page", async () => {
    const response = await owner.get(`${BASE}/desk`);

    expect(response.status).to.equal(200);
    expect(response.data).to.deep.include({
      name: "desk",
      title: "Not yet",
      pages: [],
      issues: [],
    });
  });

  it("lists the mockup as a draft of no page", async () => {
    const listed = summarySchema.parse((await owner.get(BASE)).data);

    expect(listed.results).to.deep.equal([
      { name: "desk", pages: 0, status: "draft" },
    ]);
  });

  it("opens the event stream of the mockup with no page", async () => {
    const response = await owner.get(`${BASE}/desk/events`, {
      responseType: "stream",
    });
    const body: unknown = response.data;
    if (body instanceof Readable) body.destroy();

    expect(response.status).to.equal(200);
  });

  it("answers 404 for a page of a mockup that has none", async () => {
    const response = await owner.get(`${BASE}/desk/pages/home/fixtures/orders`);

    expect(response.status).to.equal(404);
  });
});

describe("[unit] mockup spec JSON Schema: pages", () => {
  const validate = new Ajv2020({ validateFormats: false }).compile(
    MOCKUP_SPEC_SCHEMA,
  );

  it("accepts an empty list of pages", () => {
    expect(validate({ version: 1, pages: [] })).to.equal(true);
  });

  it("still requires the pages key", () => {
    expect(validate({ version: 1 })).to.equal(false);
  });
});
