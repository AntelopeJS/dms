import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { AxiosInstance } from "axios";
import { expect } from "chai";
import { z } from "zod";
import { MOCKUP_API, serveMockupRoutes } from "../../helpers/mockup-routes";

const HISTORY = `${MOCKUP_API}/desk/history`;

function specOf(...pages: Array<{ id: string; title: string }>) {
  return {
    version: 1,
    pages: pages.map(({ id, title }) => ({
      id,
      title,
      fixtures: { orders: [{ _id: `${id}-1` }] },
      tree: [
        {
          type: "KpiCard",
          options: { title, value: "fixture:orders" },
        },
      ],
    })),
  };
}

const HOME = specOf({ id: "home", title: "Home" });
const TWO = specOf(
  { id: "home", title: "Home" },
  { id: "orders", title: "Orders" },
);

const listSchema = z.object({
  versions: z.array(
    z.object({
      seq: z.number(),
      at: z.string(),
      by: z.enum(["ai", "you", "disk"]),
      summary: z.string(),
    }),
  ),
});

const versionSchema = z.object({
  seq: z.number(),
  spec: z.record(z.string(), z.unknown()),
  state: z.object({
    revision: z.number(),
    pages: z.array(z.object({ id: z.string(), tree: z.array(z.unknown()) })),
  }),
});

const writeSchema = z.union([
  z.object({ ok: z.literal(true), digest: z.string() }),
  z.object({ ok: z.literal(false) }),
]);

describe("[unit] mockup history routes", () => {
  const served = serveMockupRoutes(JSON.stringify(HOME));
  let owner: AxiosInstance;
  let directory: string;

  before(() => {
    ({ owner, dir: directory } = served());
  });

  async function versions() {
    return listSchema.parse((await owner.get(HISTORY)).data).versions;
  }

  it("records the first read of a spec that was on disk, then each write of the viewer", async () => {
    await owner.get(`${MOCKUP_API}/desk`);
    await owner.put(`${MOCKUP_API}/desk/spec`, { spec: TWO });

    const listed = await versions();
    expect(listed.map(({ by, summary }) => [by, summary])).to.deep.equal([
      ["you", "Added Orders"],
      ["disk", "Created with 1 page"],
    ]);
  });

  it("lists versions without their specs", async () => {
    const { data }: { data: unknown } = await owner.get(HISTORY);

    expect(JSON.stringify(data)).to.not.contain("fixtures");
  });

  it("answers one version with its spec and how it draws, its fixtures read from that version", async () => {
    const { data }: { data: unknown } = await owner.get(`${HISTORY}/1`);
    const version = versionSchema.parse(data);

    expect(version.spec).to.deep.equal(HOME);
    expect(version.state.revision).to.equal(0);
    expect(version.state.pages.map(({ id }) => id)).to.deep.equal(["home"]);
    expect(JSON.stringify(version.state.pages)).to.contain(
      `${HISTORY}/1/pages/home/fixtures/orders`,
    );
    const fixture = await owner.get(`${HISTORY}/1/pages/home/fixtures/orders`);
    expect(fixture.data).to.deep.equal([{ _id: "home-1" }]);
    const rows = await owner.get(
      `${HISTORY}/1/pages/home/fixtures/orders/rows`,
    );
    expect(rows.status).to.equal(200);
  });

  it("answers 404 for a version, a page or a fixture that does not exist", async () => {
    const statuses = await Promise.all(
      [
        `${HISTORY}/99`,
        `${HISTORY}/0`,
        `${HISTORY}/x`,
        `${HISTORY}/1/pages/orders/fixtures/orders`,
        `${HISTORY}/1/pages/home/fixtures/nothing`,
        `${MOCKUP_API}/missing/history`,
      ].map(async (url) => (await owner.get(url)).status),
    );

    expect(statuses).to.deep.equal([404, 404, 404, 404, 404, 404]);
  });

  it("restores a version as the current spec, and records the restore as a new version by you", async () => {
    const restored = writeSchema.parse(
      (await owner.post(`${HISTORY}/1/restore`)).data,
    );
    const file: unknown = JSON.parse(
      await readFile(join(directory, "mockups", "desk", "spec.json"), "utf8"),
    );
    const [newest, ...older] = await versions();

    expect(restored.ok).to.equal(true);
    expect(file).to.deep.equal(HOME);
    expect(newest).to.include({
      seq: 3,
      by: "you",
      summary: "Restored version 1",
    });
    expect(older.map(({ seq }) => seq)).to.deep.equal([2, 1]);
  });

  it("keeps a restore as its own version when the viewer writes again right after", async () => {
    await owner.put(`${MOCKUP_API}/desk/spec`, { spec: TWO });

    const listed = await versions();
    expect(listed.map(({ seq, summary }) => [seq, summary])).to.deep.equal([
      [4, "Added Orders"],
      [3, "Restored version 1"],
      [2, "Added Orders"],
      [1, "Created with 1 page"],
    ]);
  });

  it("picks up a change made in an editor as a version by disk", async () => {
    await writeFile(
      join(directory, "mockups", "desk", "spec.json"),
      JSON.stringify(specOf({ id: "home", title: "Home page" })),
    );
    await owner.get(`${MOCKUP_API}/desk`);

    const [newest] = await versions();
    expect(newest).to.include({
      by: "disk",
      summary: "Changed Home page · Removed Orders",
    });
  });
});
