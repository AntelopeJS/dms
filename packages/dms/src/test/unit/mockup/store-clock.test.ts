import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect } from "chai";
import { z } from "zod";
import { mockupNameSchema, MockupStore } from "../../../mockup";

const NAME = mockupNameSchema.parse("desk");
const DAY = 86_400_000;

const SPEC = JSON.stringify({
  version: 1,
  pages: [
    {
      id: "home",
      title: "Home",
      fixtures: {
        people: { $generate: { rows: 40, fields: { at: "date" } } },
      },
      tree: [{ type: "KpiCard", options: { title: "People", staticValue: 1 } }],
    },
  ],
});

describe("[unit] mockup store: the clock of generated dates", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "dms-mockups-clock-"));
    await mkdir(join(root, NAME));
    await writeFile(join(root, NAME, "spec.json"), SPEC);
  });

  afterEach(() => rm(root, { recursive: true, force: true }));

  it("counts the dates of a fixture back from the store's clock (fails a store that reads the system time)", async () => {
    const now = Date.parse("2031-06-15T10:00:00Z");
    const store = new MockupStore(root, undefined, () => now);

    const rows = z
      .array(z.object({ at: z.string() }))
      .parse(await store.fixture(NAME, "home", "people"));
    const dates = rows.map((row) => Date.parse(row.at));

    expect(rows).to.have.length(40);
    expect(dates.every((at) => at <= now && at > now - 31 * DAY)).to.equal(
      true,
    );
  });
});
