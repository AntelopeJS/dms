import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  getRegisteredRoutes,
  UnregisterRoute,
} from "@antelopejs/interface-api";
import { expect } from "chai";
import { z } from "zod";
import {
  closeMockupStreams,
  type MockupEngine,
  MockupStore,
  registerMockupRoutes,
} from "../../../mockup";
import { createClient } from "../../helpers/http";
import {
  answer,
  mockupTool,
  NAME,
  sketch,
  useWorkspace,
  writeAnswerSchema,
} from "../../helpers/mockup-mcp";

const BASE = "/api/mockup";
const ROUNDS = 30;
const client = createClient();

function titled(title: string) {
  return {
    version: 1,
    pages: [
      {
        id: "home",
        title,
        tree: [{ type: "KpiCard", options: { title: "Revenue" } }],
      },
    ],
  };
}

const digestSchema = z.object({ digest: z.string() });
const specSchema = z.object({
  pages: z.array(z.object({ title: z.string() })),
});

/** Serves the mockup routes over `mockups`, and stops serving. */
function serve(mockups: string): () => void {
  const engine: MockupEngine = {
    store: new MockupStore(mockups),
    streams: new Set(),
  };
  registerMockupRoutes(engine);
  const ids = getRegisteredRoutes()
    .filter((route) => route.location.startsWith(BASE))
    .map((route) => Number(route.id));
  return () => {
    ids.forEach(UnregisterRoute);
    closeMockupStreams(engine);
    engine.store.close();
  };
}

describe("[unit] mockup spec writes are serialized per mockup", () => {
  const workspace = useWorkspace();
  let specPath: string;
  let stop: () => void;

  beforeEach(async () => {
    await mkdir(join(workspace.mockups(), NAME), { recursive: true });
    specPath = join(workspace.mockups(), NAME, "spec.json");
    stop = serve(workspace.mockups());
  });

  afterEach(() => stop());

  async function readDigest(): Promise<string> {
    return digestSchema.parse((await client.get(`${BASE}/${NAME}/spec`)).data)
      .digest;
  }

  async function finalTitle(): Promise<string> {
    return specSchema.parse(JSON.parse(await readFile(specPath, "utf8")))
      .pages[0].title;
  }

  it("answers 200 to one of two PUTs carrying the same digest and 409 to the other (fails when the digest check runs outside the write section)", async () => {
    for (let round = 0; round < ROUNDS; round += 1) {
      await writeFile(specPath, JSON.stringify(titled("Base")));
      const digest = await readDigest();

      const statuses = (
        await Promise.all([
          client.put(`${BASE}/${NAME}/spec`, { spec: titled("One"), digest }),
          client.put(`${BASE}/${NAME}/spec`, { spec: titled("Two"), digest }),
        ])
      )
        .map((reply) => reply.status)
        .sort((left, right) => left - right);

      expect(statuses, `round ${round}`).to.deep.equal([200, 409]);
    }
  });

  it("never answers 200 to a PUT whose write an AI write then replaces unseen (fails when the PUT and an AI write interleave)", async () => {
    const write = mockupTool("mockup_write_spec");
    for (let round = 0; round < ROUNDS; round += 1) {
      await writeFile(specPath, JSON.stringify(titled("Base")));
      const digest = await readDigest();
      const put = client.put(`${BASE}/${NAME}/spec`, {
        spec: titled("Editor"),
        digest,
      });
      const ai = new Promise((resolve) => setTimeout(resolve, round % 6)).then(
        () => write.call({ mockup: NAME, spec: titled("AI") }),
      );

      const [reply] = await Promise.all([put, ai]);

      const title = await finalTitle();
      expect(
        reply.status === 200 && title === "Editor",
        `round ${round}: the PUT answered ${reply.status} and the file reads ${title}`,
      ).to.equal(false);
    }
  });
});

describe("[unit] mockup_patch_spec reads its base inside the write section", () => {
  const workspace = useWorkspace();
  const write = mockupTool("mockup_write_spec");
  const patch = mockupTool("mockup_patch_spec");

  it("keeps both of two concurrent patches that touch different pages (fails when a patch reads its base before the write section)", async () => {
    for (let round = 0; round < ROUNDS; round += 1) {
      await write.call({
        mockup: NAME,
        spec: {
          version: 1,
          pages: [
            { id: "a", title: "A", tree: [sketch("<p>a</p>")] },
            { id: "b", title: "B", tree: [sketch("<p>b</p>")] },
          ],
        },
      });

      const results = await Promise.all(
        [0, 1].map((index) =>
          answer(
            patch,
            {
              mockup: NAME,
              patch: [
                {
                  op: "replace",
                  path: `/pages/${index}/title`,
                  value: `Patched ${index}`,
                },
              ],
            },
            writeAnswerSchema,
          ),
        ),
      );

      const titles = specSchema
        .parse(JSON.parse(await workspace.specBytes()))
        .pages.map((page) => page.title);
      expect(results.map((result) => result.ok)).to.deep.equal([true, true]);
      expect(titles, `round ${round}`).to.deep.equal([
        "Patched 0",
        "Patched 1",
      ]);
    }
  });
});
