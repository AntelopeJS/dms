import { readFile, writeFile } from "node:fs/promises";
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

/** How many times `run` compiled a spec. */
async function compilesDuring(run: () => Promise<void>): Promise<number> {
  const compile = await import("../../../mockup/compile");
  const compileSpec = compile.compileSpec;
  let count = 0;
  Reflect.set(
    compile,
    "compileSpec",
    (...args: Parameters<typeof compileSpec>) => {
      count++;
      return compileSpec(...args);
    },
  );
  try {
    await run();
  } finally {
    Reflect.set(compile, "compileSpec", compileSpec);
  }
  return count;
}

describe("[unit] mockup history routes: a version compiles once", () => {
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

  it("compiles a version once for its answer and every fixture its blocks read", async () => {
    const compiles = await compilesDuring(async () => {
      expect((await owner.get(`${HISTORY}/1`)).status).to.equal(200);
      await readAll();
      await readAll();
    });

    expect(compiles).to.equal(1);
  });

  it("compiles a version again once its file changed, and answers the new fixtures", async () => {
    const stored: unknown = JSON.parse(await readFile(versionFile, "utf8"));
    await writeFile(
      versionFile,
      JSON.stringify({
        ...Object(stored),
        spec: specOf("second, with a longer label"),
      }),
    );

    const compiles = await compilesDuring(async () => {
      const [fixture] = await readAll();
      expect(fixture).to.deep.equal([
        { _id: "metric0-1", label: "second, with a longer label" },
      ]);
    });

    expect(compiles).to.equal(1);
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
