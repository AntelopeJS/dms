import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect } from "chai";
import {
  getRegisteredRoutes,
  UnregisterRoute,
} from "@antelopejs/interface-api";
import { z } from "zod";
import {
  closeMockupStreams,
  type MockupEngine,
  MockupStore,
  registerMockupRoutes,
} from "../../../mockup";
import { createClient } from "../../helpers/http";

const BASE = "/api/mockup";
const client = createClient();

const SPEC = {
  version: 1,
  pages: [
    {
      id: "home",
      title: "Home",
      tree: [{ type: "KpiCard", options: { title: "Revenue" } }],
    },
  ],
};

const sourceSchema = z.object({
  spec: z.record(z.unknown()),
  digest: z.string(),
});

const writeSchema = z.union([
  z.object({ ok: z.literal(true), digest: z.string() }),
  z.object({
    ok: z.literal(false),
    errors: z.array(z.object({ path: z.string(), message: z.string() })),
  }),
]);

const catalogSchema = z.object({
  blocks: z.array(
    z.object({ type: z.string(), config: z.record(z.unknown()) }).passthrough(),
  ),
});

describe("[unit] mockup spec source routes", () => {
  let base: string;
  let specPath: string;
  let engine: MockupEngine;
  const routeIds: number[] = [];

  before(async () => {
    base = await mkdtemp(join(tmpdir(), "dms-mockup-source-"));
    await mkdir(join(base, "mockups", "desk"), { recursive: true });
    specPath = join(base, "mockups", "desk", "spec.json");
    engine = {
      store: new MockupStore(join(base, "mockups")),
      streams: new Set(),
    };
    registerMockupRoutes(engine);
    routeIds.push(
      ...getRegisteredRoutes()
        .filter((route) => route.location.startsWith(BASE))
        .map((route) => Number(route.id)),
    );
  });

  beforeEach(() => writeFile(specPath, JSON.stringify(SPEC)));

  after(async () => {
    routeIds.forEach(UnregisterRoute);
    closeMockupStreams(engine);
    engine.store.close();
    await rm(base, { recursive: true, force: true });
  });

  it("serves the spec as written, before any compilation", async () => {
    const answer = await client.get(`${BASE}/desk/spec`);

    expect(answer.status).to.equal(200);
    expect(sourceSchema.parse(answer.data).spec).to.deep.equal(SPEC);
  });

  it("writes a valid spec and answers the digest the next read serves", async () => {
    const { digest } = sourceSchema.parse(
      (await client.get(`${BASE}/desk/spec`)).data,
    );
    const renamed = {
      ...SPEC,
      pages: [{ ...SPEC.pages[0], title: "Start" }],
    };

    const written = writeSchema.parse(
      (await client.put(`${BASE}/desk/spec`, { spec: renamed, digest })).data,
    );
    const reread = sourceSchema.parse(
      (await client.get(`${BASE}/desk/spec`)).data,
    );

    expect(written.ok && written.digest).to.equal(reread.digest);
    expect(reread.spec).to.deep.equal(renamed);
  });

  it("refuses a write based on a spec that changed since it was read", async () => {
    const { digest } = sourceSchema.parse(
      (await client.get(`${BASE}/desk/spec`)).data,
    );
    await writeFile(specPath, JSON.stringify({ ...SPEC, title: "By the AI" }));

    const refused = await client.put(`${BASE}/desk/spec`, {
      spec: SPEC,
      digest,
    });

    expect(refused.status).to.equal(409);
    expect(JSON.parse(await readFile(specPath, "utf8"))).to.deep.equal({
      ...SPEC,
      title: "By the AI",
    });
  });

  it("refuses a spec with an unknown block and leaves the file as it was", async () => {
    const before = await readFile(specPath, "utf8");

    const refused = writeSchema.parse(
      (
        await client.put(`${BASE}/desk/spec`, {
          spec: {
            ...SPEC,
            pages: [{ ...SPEC.pages[0], tree: [{ type: "Nope" }] }],
          },
        })
      ).data,
    );

    expect(refused.ok).to.equal(false);
    expect(await readFile(specPath, "utf8")).to.equal(before);
  });

  it("lists the registered block types with their described options", async () => {
    const catalog = catalogSchema.parse(
      (await client.get(`${BASE}/schema/blocks`)).data,
    );
    const kpi = catalog.blocks.find((block) => block.type === "KpiCard");

    expect(kpi?.config).to.have.property("title");
  });
});
