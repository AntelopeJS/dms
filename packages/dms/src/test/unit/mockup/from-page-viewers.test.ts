import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect } from "chai";
import { z } from "zod";
import { type JsonObject, jsonObjectSchema } from "../../../mockup";
import { followEvents } from "../../helpers/mockup-events";
import { lock } from "../../helpers/mockup-presence";
import { stubPages, structureOf } from "../../helpers/live-page";
import {
  MOCKUP_API as BASE,
  serveMockupRoutes,
} from "../../helpers/mockup-routes";

const REF = "/books";
const FIRST = "/pages/0/tree/0";

const SPEC: JsonObject = {
  version: 1,
  pages: [
    {
      id: "books",
      title: "Books",
      livePage: { ref: REF, version: "an-older-version" },
      tree: [
        { type: "KpiCard", options: { title: "Revenue" } },
        { type: "KpiCard", options: { title: "Orders" } },
      ],
    },
  ],
};

const LIVE = stubPages([
  structureOf(REF, [
    {
      name: "revenue",
      type: "KpiCard",
      config: { title: "Turnover", fetchUrl: "/api/books/revenue" },
    },
  ]),
]);

const sourceSchema = z.object({ spec: jsonObjectSchema, digest: z.string() });
const refusalSchema = z.object({
  error: z.literal("conflict"),
  errors: z.array(z.object({ path: z.string(), message: z.string() })),
});

describe("[unit] mockup: a page converted over a mockup a viewer holds a block of", () => {
  const served = serveMockupRoutes(JSON.stringify(SPEC), undefined, LIVE);

  it("is refused while another viewer holds a block the conversion changes, naming the holder and leaving the file as it was, and written once the block is let go (fails when a replace from a page ignores the locks)", async () => {
    const { owner, ownerToken, dir } = served();
    const specPath = join(dir, "mockups", "desk", "spec.json");
    const viewer = randomUUID();
    const stream = await followEvents("desk", ownerToken, viewer);
    try {
      await lock(owner, viewer, FIRST);
      const read = sourceSchema.parse(
        (await owner.get(`${BASE}/desk/spec`)).data,
      );
      const before = await readFile(specPath, "utf8");
      const replace = () =>
        owner.post(`${BASE}/from-page`, {
          path: REF,
          replace: true,
          mockup: "desk",
          digest: read.digest,
        });

      const refused = await replace();

      expect(refused.status).to.equal(409);
      expect(refusalSchema.parse(refused.data).errors).to.deep.equal([
        { path: FIRST, message: "Test User is editing this block" },
      ]);
      expect(await readFile(specPath, "utf8")).to.equal(before);

      await owner.delete(`${BASE}/desk/locks?viewer=${viewer}`);
      const replaced = await replace();

      expect(replaced.status).to.equal(200);
      expect(await readFile(specPath, "utf8")).to.not.equal(before);
    } finally {
      stream.close();
    }
  });
});
