import type { AxiosInstance } from "axios";
import { expect } from "chai";
import { z } from "zod";
import { MOCKUP_API, serveMockupRoutes } from "../../helpers/mockup-routes";

const DESK = `${MOCKUP_API}/desk`;
const HISTORY = `${DESK}/history`;

function specOf(...ids: string[]) {
  return {
    version: 1,
    pages: ids.map((id) => ({
      id,
      title: id,
      tree: [{ type: "KpiCard", options: { title: id } }],
    })),
  };
}

const listSchema = z.object({
  versions: z.array(z.object({ seq: z.number(), comments: z.number() })),
});

const versionSchema = z.object({
  annotations: z.array(
    z.object({
      id: z.string(),
      text: z.string(),
      status: z.enum(["open", "resolved"]),
      version: z.number(),
      resolvedVersion: z.number().optional(),
      page: z.string().optional(),
    }),
  ),
});

const noteSchema = z.object({ id: z.string() });

describe("[unit] mockup history routes: comments", () => {
  const served = serveMockupRoutes(JSON.stringify(specOf("home")));
  let owner: AxiosInstance;

  before(async () => {
    ({ owner } = served());
    await owner.get(DESK);
  });

  async function pin(page: string, text: string): Promise<string> {
    const { data }: { data: unknown } = await owner.post(
      `${DESK}/annotations`,
      {
        page,
        text,
        offset: { x: 0.5, y: 0.5 },
      },
    );
    return noteSchema.parse(data).id;
  }

  it("counts, in the list, the comments pinned on each version, resolved ones included, and answers each version's own pins with their status", async () => {
    const first = await pin("home", "on the first");
    await owner.put(`${DESK}/spec`, { spec: specOf("home", "orders") });
    await pin("orders", "on the second");
    await owner.patch(`${DESK}/annotations/${first}`, { status: "resolved" });

    const { versions } = listSchema.parse((await owner.get(HISTORY)).data);
    const one = versionSchema.parse((await owner.get(`${HISTORY}/1`)).data);
    const two = versionSchema.parse((await owner.get(`${HISTORY}/2`)).data);

    expect(versions.map(({ seq, comments }) => [seq, comments])).to.deep.equal([
      [2, 1],
      [1, 1],
    ]);
    expect(
      one.annotations.map(({ text, status, version, resolvedVersion }) => ({
        text,
        status,
        version,
        resolvedVersion,
      })),
    ).to.deep.equal([
      {
        text: "on the first",
        status: "resolved",
        version: 1,
        resolvedVersion: 2,
      },
    ]);
    expect(two.annotations.map(({ text, page }) => [text, page])).to.deep.equal(
      [["on the second", "orders"]],
    );
  });

  it("answers no comments for a version nothing was pinned on", async () => {
    await owner.post(`${HISTORY}/1/restore`);

    const { versions } = listSchema.parse((await owner.get(HISTORY)).data);

    expect(versions[0]).to.deep.equal({ seq: 3, comments: 0 });
  });
});
