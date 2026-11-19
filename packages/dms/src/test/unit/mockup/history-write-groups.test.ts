import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect } from "chai";
import { z } from "zod";
import {
  COALESCE_WINDOW_MS,
  type MockupName,
  type MockupWriteGroup,
  mockupNameSchema,
  mockupWriteGroupSchema,
  readVersions,
  recordVersion,
} from "../../../mockup";

const pageIdsSchema = z.object({
  pages: z.array(z.object({ id: z.string() })),
});
const DESK: MockupName = mockupNameSchema.parse("desk");
const START = Date.parse("2026-01-01T10:00:00.000Z");
const FIX_DELAY_MS = 90_000;
const LONG_REPLY_MS = 5 * 60_000;

function specOf(...titles: string[]) {
  return {
    version: 1,
    pages: titles.map((title) => ({
      id: title.toLowerCase(),
      title,
      tree: [{ type: "KpiCard", options: { title } }],
    })),
  };
}

function group(raw: string): MockupWriteGroup {
  return mockupWriteGroupSchema.parse(raw);
}

function at(offsetMs: number): Date {
  return new Date(START + offsetMs);
}

describe("[unit] mockup history: write groups", () => {
  let root = "";
  const mockups = () => join(root, "mockups");
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "dms-mockup-write-groups-"));
    await mkdir(join(mockups(), "desk"), { recursive: true });
  });
  afterEach(() => rm(root, { recursive: true, force: true }));

  const seqs = async () =>
    (await readVersions(mockups(), DESK)).map(({ seq, by }) => [seq, by]);
  const pagesByVersion = async () =>
    (await readVersions(mockups(), DESK)).map(({ seq, spec }) => [
      seq,
      pageIdsSchema.parse(spec).pages.map(({ id }) => id),
    ]);

  it("folds the AI writes of one group into one version however long the reply takes, and gives a write of the next group a version of its own even 90 seconds later (fails when a comment fix folds into the build before it)", async () => {
    const build = group("reply-1");
    await recordVersion(mockups(), DESK, specOf("Orders"), {
      by: "ai",
      group: build,
      at: at(0),
    });
    await recordVersion(mockups(), DESK, specOf("Orders", "Customers"), {
      by: "ai",
      group: build,
      at: at(LONG_REPLY_MS),
    });
    await recordVersion(mockups(), DESK, specOf("Orders", "Clients"), {
      by: "ai",
      group: group("reply-2"),
      at: at(LONG_REPLY_MS + FIX_DELAY_MS),
    });

    expect(await pagesByVersion()).to.deep.equal([
      [1, ["orders", "customers"]],
      [2, ["orders", "clients"]],
    ]);
  });

  it("never folds an AI write with a group and one without, while two without one still fold within the window (fails when a grouped write joins a version Claude Code wrote)", async () => {
    await recordVersion(mockups(), DESK, specOf("Orders"), {
      by: "ai",
      at: at(0),
    });
    await recordVersion(mockups(), DESK, specOf("Orders", "Customers"), {
      by: "ai",
      group: group("reply-1"),
      at: at(1000),
    });
    await recordVersion(mockups(), DESK, specOf("Customers"), {
      by: "ai",
      at: at(2000),
    });
    await recordVersion(mockups(), DESK, specOf("Coupons"), {
      by: "ai",
      at: at(COALESCE_WINDOW_MS),
    });

    expect(await seqs()).to.deep.equal([
      [1, "ai"],
      [2, "ai"],
      [3, "ai"],
    ]);
  });

  it("refuses a write group past 128 characters or with a character outside letters, digits, _ and -", () => {
    expect(mockupWriteGroupSchema.safeParse("a".repeat(128)).success).to.equal(
      true,
    );
    expect(mockupWriteGroupSchema.safeParse("A-z_09").success).to.equal(true);
    for (const raw of ["", "a".repeat(129), "reply 1", "reply/1", "é"]) {
      expect(mockupWriteGroupSchema.safeParse(raw).success, raw).to.equal(
        false,
      );
    }
  });
});
