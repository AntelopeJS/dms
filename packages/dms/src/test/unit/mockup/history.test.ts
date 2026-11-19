import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { mock } from "node:test";
import { expect } from "chai";
import {
  COALESCE_WINDOW_MS,
  HISTORY_LIMIT,
  historyDirectory,
  listVersions,
  type MockupName,
  parseMockupName,
  readVersion,
  readVersions,
  recordVersion,
  removeHistory,
  renameHistory,
  summarizeChange,
  withSpecLock,
  writeSpec,
} from "../../../mockup";

function nameOf(raw: string): MockupName {
  const name = parseMockupName(raw);
  if (!name) throw new Error(`${raw} is a valid mockup name`);
  return name;
}

const DESK = nameOf("desk");

function page(id: string, title: string, revenue = "Revenue") {
  return {
    id,
    title,
    tree: [{ type: "KpiCard", options: { title: revenue } }],
  };
}

function specOf(...pages: Array<ReturnType<typeof page>>) {
  return { version: 1, pages };
}

const START = Date.parse("2026-01-01T10:00:00.000Z");

describe("[unit] mockup history: summaries", () => {
  it("says how many pages the first version was created with", () => {
    expect(summarizeChange(undefined, specOf(page("a", "A")))).to.equal(
      "Created with 1 page",
    );
    expect(
      summarizeChange(undefined, specOf(page("a", "A"), page("b", "B"))),
    ).to.equal("Created with 2 pages");
  });

  it("names the pages added, changed and removed", () => {
    const before = specOf(
      page("overview", "Overview"),
      page("coupons", "Coupons"),
    );
    const after = specOf(
      page("overview", "Overview", "Sales"),
      page("orders", "Orders"),
      page("customers", "Customers"),
    );

    expect(summarizeChange(before, after)).to.equal(
      "Added Orders, Customers · Changed Overview · Removed Coupons",
    );
  });

  it("counts the names past the third", () => {
    const after = specOf(
      page("a", "A"),
      page("b", "B"),
      page("c", "C"),
      page("d", "D"),
      page("e", "E"),
    );

    expect(summarizeChange(specOf(), after)).to.equal(
      "Added A, B, C and 2 more",
    );
  });

  it("says when only the order or the settings changed", () => {
    const pages = [page("a", "A"), page("b", "B")];
    const same = specOf(...pages);

    expect(summarizeChange(same, specOf(pages[1], pages[0]))).to.equal(
      "Reordered pages",
    );
    expect(summarizeChange(same, { ...same, title: "Shop" })).to.equal(
      "Changed mockup settings",
    );
    expect(summarizeChange(same, specOf(...pages))).to.equal("No page changes");
  });
});

/** A project folder per test, and the `mockups/` directory inside it. */
function useProject(): () => string {
  let root = "";
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "dms-mockup-history-"));
    await mkdir(join(root, "mockups", "desk"), { recursive: true });
  });
  afterEach(async () => {
    mock.timers.reset();
    await rm(root, { recursive: true, force: true });
  });
  return () => join(root, "mockups");
}

function at(offsetMs: number): Date {
  return new Date(START + offsetMs);
}

describe("[unit] mockup history: recording", () => {
  const project = useProject();
  let mockups = "";
  beforeEach(() => {
    mockups = project();
  });

  it("keeps the versions next to mockups/, out of the project's git tree", () => {
    expect(historyDirectory(mockups, DESK)).to.equal(
      join(dirname(mockups), ".antelope", "mockup-history", "desk"),
    );
  });

  it("numbers each version and describes it against the one before", async () => {
    const first = specOf(page("a", "A"));
    const second = specOf(page("a", "A"), page("b", "B"));
    await recordVersion(mockups, DESK, first, { by: "ai", at: at(0) });
    await recordVersion(mockups, DESK, second, { by: "you", at: at(1000) });

    expect(await listVersions(mockups, DESK)).to.deep.equal([
      {
        seq: 2,
        at: at(1000).toISOString(),
        by: "you",
        summary: "Added B",
      },
      {
        seq: 1,
        at: at(0).toISOString(),
        by: "ai",
        summary: "Created with 1 page",
      },
    ]);
    expect((await readVersion(mockups, DESK, 2))?.spec).to.deep.equal(second);
  });

  it("records nothing for a spec equal to the newest version", async () => {
    const spec = specOf(page("a", "A"));
    await recordVersion(mockups, DESK, spec, { by: "ai", at: at(0) });
    const again = await recordVersion(mockups, DESK, spec, {
      by: "you",
      at: at(5 * COALESCE_WINDOW_MS),
    });

    expect(again).to.equal(undefined);
    expect(await readVersions(mockups, DESK)).to.have.length(1);
  });
});

describe("[unit] mockup history: coalescing", () => {
  const project = useProject();
  let mockups = "";
  beforeEach(() => {
    mockups = project();
  });

  it("folds writes by one author within the window into one version, the latest spec, the latest time", async () => {
    const build = [
      specOf(page("a", "A")),
      specOf(page("a", "A"), page("b", "B")),
      specOf(page("a", "A"), page("b", "B"), page("c", "C")),
    ];
    for (const [index, spec] of build.entries()) {
      await recordVersion(mockups, DESK, spec, {
        by: "ai",
        at: at(index * 60_000),
      });
    }

    const versions = await readVersions(mockups, DESK);
    expect(versions).to.have.length(1);
    expect(versions[0].spec).to.deep.equal(build[2]);
    expect(versions[0].at).to.equal(at(120_000).toISOString());
    expect(versions[0].summary).to.equal("Created with 3 pages");
  });

  it("describes a folded version against the version before it, not the one it replaced", async () => {
    await recordVersion(mockups, DESK, specOf(page("a", "A")), {
      by: "you",
      at: at(0),
    });
    await recordVersion(mockups, DESK, specOf(page("a", "A"), page("b", "B")), {
      by: "ai",
      at: at(10_000),
    });
    await recordVersion(
      mockups,
      DESK,
      specOf(page("a", "A"), page("b", "B"), page("c", "C")),
      { by: "ai", at: at(20_000) },
    );

    const [newest] = await listVersions(mockups, DESK);
    expect(newest.seq).to.equal(2);
    expect(newest.summary).to.equal("Added B, C");
  });

  it("starts a new version once the window has passed since the last write", async () => {
    await recordVersion(mockups, DESK, specOf(page("a", "A")), {
      by: "ai",
      at: at(0),
    });
    await recordVersion(mockups, DESK, specOf(page("b", "B")), {
      by: "ai",
      at: at(COALESCE_WINDOW_MS - 1),
    });
    await recordVersion(mockups, DESK, specOf(page("c", "C")), {
      by: "ai",
      at: at(2 * COALESCE_WINDOW_MS),
    });

    expect(await readVersions(mockups, DESK)).to.have.length(2);
  });

  it("never folds writes by different authors", async () => {
    await recordVersion(mockups, DESK, specOf(page("a", "A")), {
      by: "ai",
      at: at(0),
    });
    await recordVersion(mockups, DESK, specOf(page("b", "B")), {
      by: "you",
      at: at(1000),
    });

    expect(await readVersions(mockups, DESK)).to.have.length(2);
  });

  it("never folds into a sealed version", async () => {
    await recordVersion(mockups, DESK, specOf(page("a", "A")), {
      by: "you",
      sealed: true,
      at: at(0),
    });
    await recordVersion(mockups, DESK, specOf(page("b", "B")), {
      by: "you",
      at: at(1000),
    });

    expect(await readVersions(mockups, DESK)).to.have.length(2);
  });

  it("never folds a sealed write into the version before it", async () => {
    await recordVersion(mockups, DESK, specOf(page("a", "A")), {
      by: "you",
      at: at(0),
    });
    await recordVersion(mockups, DESK, specOf(page("b", "B")), {
      by: "you",
      sealed: true,
      at: at(1000),
    });

    expect(await readVersions(mockups, DESK)).to.have.length(2);
  });

  it("coalesces writes through writeSpec on the clock of the day", async () => {
    mock.timers.enable({ apis: ["Date"], now: START });
    await writeSpec(mockups, DESK, specOf(page("a", "A")), { by: "ai" });
    mock.timers.setTime(START + 30_000);
    await writeSpec(mockups, DESK, specOf(page("a", "A"), page("b", "B")), {
      by: "ai",
    });
    mock.timers.setTime(START + 30_000 + COALESCE_WINDOW_MS);
    await writeSpec(mockups, DESK, specOf(page("c", "C")), { by: "ai" });

    const versions = await listVersions(mockups, DESK);
    expect(versions.map(({ seq, summary }) => [seq, summary])).to.deep.equal([
      [2, "Added C · Removed A, B"],
      [1, "Created with 2 pages"],
    ]);
  });
});

describe("[unit] mockup history: pruning", () => {
  const project = useProject();
  let mockups = "";
  beforeEach(() => {
    mockups = project();
  });

  it(`keeps the last ${HISTORY_LIMIT} versions`, async () => {
    const total = HISTORY_LIMIT + 7;
    for (let index = 1; index <= total; index += 1) {
      await recordVersion(mockups, DESK, specOf(page("a", `Title ${index}`)), {
        by: index % 2 ? "ai" : "you",
        at: at(index * 10 * COALESCE_WINDOW_MS),
      });
    }

    const files = await readdir(historyDirectory(mockups, DESK));
    const seqs = (await readVersions(mockups, DESK)).map(({ seq }) => seq);
    expect(files).to.have.length(HISTORY_LIMIT);
    expect(seqs[0]).to.equal(total - HISTORY_LIMIT + 1);
    expect(seqs.at(-1)).to.equal(total);
  });
});

describe("[unit] mockup history: writes", () => {
  const project = useProject();
  let mockups = "";
  beforeEach(() => {
    mockups = project();
  });

  it("records a write by its author, and takes the optional summary in place of the automatic one", async () => {
    await writeSpec(mockups, DESK, specOf(page("a", "A")), {
      by: "ai",
      summary: "Start the dashboard",
    });

    const [version] = await listVersions(mockups, DESK);
    expect(version).to.include({ by: "ai", summary: "Start the dashboard" });
  });

  it("records no version for a spec the write refuses", async () => {
    const refused = await writeSpec(
      mockups,
      DESK,
      { version: 1, pages: [{ id: "A bad id" }] },
      { by: "ai" },
    );

    expect(refused.ok).to.equal(false);
    expect(await readVersions(mockups, DESK)).to.deep.equal([]);
  });

  it("keeps what was on disk before the first write, as a version by disk", async () => {
    const before = specOf(page("a", "Hand written"));
    await writeFile(join(mockups, "desk", "spec.json"), JSON.stringify(before));
    await writeSpec(mockups, DESK, specOf(page("a", "Rewritten")), {
      by: "ai",
    });

    const versions = await readVersions(mockups, DESK);
    expect(versions.map(({ by }) => by)).to.deep.equal(["disk", "ai"]);
    expect(versions[0].spec).to.deep.equal(before);
  });

  it("takes a stamped id into the newest version instead of recording a new one", async () => {
    await writeSpec(mockups, DESK, specOf(page("a", "A")), { by: "ai" });
    await withSpecLock(mockups, DESK, async (_write, stamp) => {
      const text = await readFile(join(mockups, "desk", "spec.json"), "utf8");
      await stamp(text, [{ path: "/pages/0/tree/0", id: "b-abcd1234" }]);
    });

    const versions = await readVersions(mockups, DESK);
    expect(versions).to.have.length(1);
    expect(JSON.stringify(versions[0].spec)).to.contain("b-abcd1234");
  });
});

describe("[unit] mockup history: moving a mockup", () => {
  const project = useProject();
  let mockups = "";
  beforeEach(() => {
    mockups = project();
  });

  it("renames and removes its history with it", async () => {
    await writeSpec(mockups, DESK, specOf(page("a", "A")), { by: "ai" });
    const desk2 = nameOf("desk-2");
    await renameHistory(mockups, DESK, desk2);

    expect(await readVersions(mockups, DESK)).to.deep.equal([]);
    expect(await readVersions(mockups, desk2)).to.have.length(1);

    await removeHistory(mockups, desk2);
    expect(await readVersions(mockups, desk2)).to.deep.equal([]);
  });
});
