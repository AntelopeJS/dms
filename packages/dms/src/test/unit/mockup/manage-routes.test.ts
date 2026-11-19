import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect } from "chai";
import { z } from "zod";
import { MOCKUP_API, serveMockupRoutes } from "../../helpers/mockup-routes";

const BASE = MOCKUP_API;

const SPEC = {
  version: 1,
  title: "Desk",
  source: "chat",
  built: { at: "2026-11-13T10:00:00.000Z", pages: [{ path: "/desk" }] },
  pages: [
    {
      id: "home",
      title: "Home",
      tree: [{ type: "KpiCard", options: { title: "Revenue" } }],
    },
  ],
};

const NOTE = {
  page: "home",
  path: "/pages/0/tree/0",
  offset: { x: 0.5, y: 0.5 },
  text: "Check this",
};

const namedSchema = z.object({ name: z.string() });
const summariesSchema = z.object({
  results: z.array(
    z.object({
      name: z.string(),
      title: z.string().optional(),
      status: z.enum(["draft", "built"]),
      openComments: z.number(),
    }),
  ),
});

describe("[unit] mockup routes: rename, duplicate and delete", () => {
  const served = serveMockupRoutes(JSON.stringify(SPEC));

  async function reset(): Promise<void> {
    const root = join(served().dir, "mockups");
    await rm(root, { recursive: true, force: true });
    await mkdir(join(root, "desk"), { recursive: true });
    await writeFile(join(root, "desk", "spec.json"), JSON.stringify(SPEC));
  }

  async function namesOf(): Promise<string[]> {
    const listed = await served().owner.get(BASE);
    return summariesSchema.parse(listed.data).results.map(({ name }) => name);
  }

  beforeEach(reset);

  it("renames the folder: the spec follows, the old name is gone", async () => {
    const { owner, dir } = served();

    const answer = await owner.patch(`${BASE}/desk`, { name: "front-desk" });

    expect(answer.status).to.equal(200);
    expect(namedSchema.parse(answer.data).name).to.equal("front-desk");
    expect(await namesOf()).to.deep.equal(["front-desk"]);
    expect((await owner.get(`${BASE}/desk`)).status).to.equal(404);
    expect(
      JSON.parse(
        await readFile(join(dir, "mockups", "front-desk", "spec.json"), "utf8"),
      ),
    ).to.deep.equal(SPEC);
  });

  it("renames the title and leaves the folder", async () => {
    const { owner, dir } = served();

    const answer = await owner.patch(`${BASE}/desk`, {
      title: "  Front desk ",
    });

    expect(namedSchema.parse(answer.data).name).to.equal("desk");
    expect(
      JSON.parse(
        await readFile(join(dir, "mockups", "desk", "spec.json"), "utf8"),
      ),
    ).to.deep.equal({ ...SPEC, title: "Front desk" });
  });

  it("refuses a rename to a taken name, a reserved one, an invalid one and an empty change", async () => {
    const { owner } = served();
    await owner.post(`${BASE}/desk/duplicate`, { name: "other" });

    const refused = await Promise.all(
      [
        { name: "other" },
        { name: "schema" },
        { name: "example" },
        { name: "Not A Slug" },
        { name: "../escape" },
        {},
        { title: "   " },
      ].map(async (body) => (await owner.patch(`${BASE}/desk`, body)).status),
    );

    expect(refused).to.deep.equal([409, 400, 400, 400, 400, 400, 400]);
    expect((await namesOf()).sort()).to.deep.equal(["desk", "other"]);
  });

  it("answers 404 for a mockup that does not exist, whatever the action", async () => {
    const { owner } = served();

    const answers = await Promise.all([
      owner.patch(`${BASE}/ghost`, { name: "phantom" }),
      owner.post(`${BASE}/ghost/duplicate`, {}),
      owner.delete(`${BASE}/ghost`),
      owner.delete(`${BASE}/schema`),
    ]);

    expect(answers.map(({ status }) => status)).to.deep.equal([
      404, 404, 404, 404,
    ]);
  });

  it("duplicates into the first free copy name, as a draft with no comments", async () => {
    const { owner } = served();
    await owner.post(`${BASE}/desk/annotations`, NOTE);

    const first = await owner.post(`${BASE}/desk/duplicate`, {});
    const second = await owner.post(`${BASE}/desk/duplicate`);

    expect(namedSchema.parse(first.data).name).to.equal("desk-copy");
    expect(namedSchema.parse(second.data).name).to.equal("desk-copy-2");
    const { results } = summariesSchema.parse((await owner.get(BASE)).data);
    const byName = new Map(results.map((entry) => [entry.name, entry]));
    expect(byName.get("desk")).to.include({ status: "built", openComments: 1 });
    expect(byName.get("desk-copy")).to.include({
      status: "draft",
      title: "Desk",
      openComments: 0,
    });
  });

  it("duplicates under the name asked, and refuses a taken or reserved one", async () => {
    const { owner } = served();

    const made = await owner.post(`${BASE}/desk/duplicate`, {
      name: "back-desk",
    });
    const taken = await owner.post(`${BASE}/desk/duplicate`, {
      name: "back-desk",
    });
    const reserved = await owner.post(`${BASE}/desk/duplicate`, {
      name: "example",
    });

    expect(namedSchema.parse(made.data).name).to.equal("back-desk");
    expect(taken.status).to.equal(409);
    expect(reserved.status).to.equal(400);
    expect((await namesOf()).sort()).to.deep.equal(["back-desk", "desk"]);
  });

  it("deletes a mockup with its comments, and only that mockup", async () => {
    const { owner, dir } = served();
    await owner.post(`${BASE}/desk/duplicate`, { name: "keep" });
    await owner.post(`${BASE}/desk/annotations`, NOTE);

    const deleted = await owner.delete(`${BASE}/desk`);

    expect(deleted.status).to.equal(200);
    expect(await namesOf()).to.deep.equal(["keep"]);
    expect(await readdir(join(dir, "mockups"))).to.deep.equal(["keep"]);
    expect((await owner.delete(`${BASE}/desk`)).status).to.equal(404);
  });
});
