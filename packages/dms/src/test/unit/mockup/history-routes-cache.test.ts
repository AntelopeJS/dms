import { readFile, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { AxiosInstance } from "axios";
import { expect } from "chai";
import { MOCKUP_API, serveMockupRoutes } from "../../helpers/mockup-routes";

const HISTORY = `${MOCKUP_API}/desk/history`;
const BLOCKS = 10;
const KEYS = Array.from({ length: BLOCKS }, (_, index) => `metric${index}`);

function specOf(label: string) {
  return {
    version: 1,
    pages: [
      {
        id: "home",
        title: "Home",
        fixtures: Object.fromEntries(
          KEYS.map((key) => [key, [{ _id: `${key}-1`, label }]]),
        ),
        tree: KEYS.map((key) => ({
          type: "KpiCard",
          options: { title: key, value: `fixture:${key}` },
        })),
      },
    ],
  };
}

/**
 * Replaces the label `from` with `to` in the version file in place, keeping
 * its inode, and sets its mtime to `seconds`.
 */
async function relabel(
  file: string,
  from: string,
  to: string,
  seconds: number,
) {
  const text = await readFile(file, "utf8");
  await writeFile(file, text.replaceAll(`"${from}"`, `"${to}"`));
  await utimes(file, seconds, seconds);
}

describe("[unit] mockup history routes: a version is compiled once while its file stays the same", () => {
  const served = serveMockupRoutes(JSON.stringify(specOf("first")));
  let owner: AxiosInstance;
  let versionFile: string;

  before(async () => {
    const { owner: client, dir } = served();
    owner = client;
    versionFile = join(dir, ".antelope", "mockup-history", "desk", "1.json");
    await owner.get(`${MOCKUP_API}/desk`);
  });

  async function readAll(): Promise<unknown[]> {
    const answers = await Promise.all(
      KEYS.flatMap((key) => [
        owner.get(`${HISTORY}/1/pages/home/fixtures/${key}`),
        owner.get(`${HISTORY}/1/pages/home/fixtures/${key}/rows`),
      ]),
    );
    return answers.map(({ data }: { data: unknown }) => data);
  }

  it("answers every fixture read from the version it compiled while the file keeps its inode, mtime and size", async () => {
    const pinned = 1_700_000_000;
    await utimes(versionFile, pinned, pinned);
    expect((await owner.get(`${HISTORY}/1`)).status).to.equal(200);
    await relabel(versionFile, "first", "fresh", pinned);

    const answers = [...(await readAll()), ...(await readAll())];

    expect(JSON.stringify(answers)).to.include('"first"');
    expect(JSON.stringify(answers)).not.to.include('"fresh"');
  });

  it("compiles a version again once its file changed, and answers the new fixtures", async () => {
    await relabel(
      versionFile,
      "fresh",
      "second, with a longer label",
      Date.now() / 1000,
    );

    const [fixture] = await readAll();

    expect(fixture).to.deep.equal([
      { _id: "metric0-1", label: "second, with a longer label" },
    ]);
  });

  it("answers 404 for a version of a deleted mockup it had compiled", async () => {
    await owner.delete(`${MOCKUP_API}/desk`);

    const statuses = await Promise.all(
      [`${HISTORY}/1`, `${HISTORY}/1/pages/home/fixtures/metric0`].map(
        async (url) => (await owner.get(url)).status,
      ),
    );

    expect(statuses).to.deep.equal([404, 404]);
  });
});
