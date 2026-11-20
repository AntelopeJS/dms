import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect } from "chai";
import { z } from "zod";
import type { JsonObject } from "../../../mockup";
import { followEvents } from "../../helpers/mockup-events";
import { lock } from "../../helpers/mockup-presence";
import {
  MOCKUP_API as BASE,
  serveMockupRoutes,
} from "../../helpers/mockup-routes";

const FIRST = "/pages/0/tree/0";

function specOf(title: string): JsonObject {
  return {
    version: 1,
    pages: [
      {
        id: "home",
        title: "Home",
        tree: [{ type: "KpiCard", options: { title } }],
      },
    ],
  };
}

const refusalSchema = z.object({
  ok: z.literal(false),
  errors: z.array(z.object({ path: z.string(), message: z.string() })),
});
const writtenSchema = z.object({ ok: z.literal(true) });

describe("[unit] mockup: a version restored over a block a viewer holds", () => {
  const served = serveMockupRoutes(JSON.stringify(specOf("Revenue")));

  it("is refused while another viewer holds a block the restore changes, naming the holder and leaving the file as it was, and restored once the block is let go (fails when a restore ignores the locks)", async () => {
    const { owner, ownerToken, dir } = served();
    const specPath = join(dir, "mockups", "desk", "spec.json");
    await owner.get(`${BASE}/desk`);
    await owner.put(`${BASE}/desk/spec`, { spec: specOf("Turnover") });
    const viewer = randomUUID();
    const stream = await followEvents("desk", ownerToken, viewer);
    try {
      await lock(owner, viewer, FIRST);
      const before = await readFile(specPath, "utf8");
      const restore = () => owner.post(`${BASE}/desk/history/1/restore`);

      const refused = refusalSchema.parse((await restore()).data);

      expect(refused.errors).to.deep.equal([
        { path: FIRST, message: "Test User is editing this block" },
      ]);
      expect(await readFile(specPath, "utf8")).to.equal(before);

      await owner.delete(`${BASE}/desk/locks?viewer=${viewer}`);
      writtenSchema.parse((await restore()).data);

      expect(JSON.parse(await readFile(specPath, "utf8"))).to.deep.equal(
        specOf("Revenue"),
      );
    } finally {
      stream.close();
    }
  });
});
