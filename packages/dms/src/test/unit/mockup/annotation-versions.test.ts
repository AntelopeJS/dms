import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect } from "chai";
import { z } from "zod";
import {
  countAnnotationsByVersion,
  createAnnotation,
  defaultMockupsDir,
  listAnnotations,
  listVersionAnnotations,
  readVersion,
  updateAnnotation,
  writeSpec,
} from "../../../mockup";
import {
  annotate,
  block,
  edit,
  MOCKUP,
  put,
  served,
} from "../../helpers/mockup-anchors";
import {
  answer,
  mockupTool,
  NAME,
  spec,
  useWorkspace,
} from "../../helpers/mockup-mcp";

const FIRST_BLOCK = "/pages/0/tree/0";

/** Records a version of its own: a sealed write folds into no other. */
async function writeAsYou(...tree: Parameters<typeof spec>): Promise<void> {
  const written = await writeSpec(defaultMockupsDir(), MOCKUP, spec(...tree), {
    by: "you",
    sealed: true,
  });
  expect(written.ok).to.equal(true);
}

function annotationsPath(): string {
  return join(defaultMockupsDir(), NAME, "annotations.json");
}

async function resolve(id: string) {
  return updateAnnotation(
    MOCKUP,
    id,
    { status: "resolved" },
    defaultMockupsDir(),
  );
}

const storedSchema = z.object({
  version: z.literal(3),
  annotations: z.array(
    z.object({
      id: z.string(),
      version: z.number().optional(),
      resolvedVersion: z.number().optional(),
    }),
  ),
});

/** Rewrites the file as a build before versions left it: no note has a version. */
async function withoutVersions(): Promise<void> {
  const file = z
    .object({ annotations: z.array(z.record(z.string(), z.unknown())) })
    .passthrough()
    .parse(JSON.parse(await readFile(annotationsPath(), "utf8")));
  await writeFile(
    annotationsPath(),
    JSON.stringify({
      ...file,
      annotations: file.annotations.map(
        ({ version: _version, ...rest }) => rest,
      ),
    }),
  );
}

async function stored() {
  return storedSchema.parse(
    JSON.parse(await readFile(annotationsPath(), "utf8")),
  ).annotations;
}

describe("[unit] mockup annotation versions", () => {
  useWorkspace();

  it("pins a note on the version that is newest when it is created, in the file and as served (fails when a note is stamped with a later version or none)", async () => {
    await put(block("<p>a</p>", "a"));
    const first = await annotate("home", FIRST_BLOCK, "on one");
    await writeAsYou(block("<p>b</p>", "a"));
    const second = await annotate("home", FIRST_BLOCK, "on two");

    expect([first.version, second.version]).to.deep.equal([1, 2]);
    expect((await stored()).map(({ version }) => version)).to.deep.equal([
      1, 2,
    ]);
    expect(
      (await listAnnotations(MOCKUP, defaultMockupsDir()))?.map(
        ({ version }) => version,
      ),
    ).to.deep.equal([1, 2]);
  });

  it("stamps resolvedVersion with the version that is newest when the note is resolved, and keeps it on a second resolve (fails when it follows the creation version or moves)", async () => {
    await put(block("<p>a</p>", "a"));
    const note = await annotate("home", FIRST_BLOCK);
    await writeAsYou(block("<p>b</p>", "a"));
    const resolved = await resolve(note.id);
    await writeAsYou(block("<p>c</p>", "a"));
    await resolve(note.id);

    expect(resolved.kind === "updated" && resolved.annotation).to.include({
      version: 1,
      resolvedVersion: 2,
      status: "resolved",
    });
    expect((await served(note.id)).resolvedVersion).to.equal(2);
  });

  it("clears resolvedVersion when a note is reopened, and leaves it off while a note stays open (fails when a reopened note still says it was resolved)", async () => {
    await put(block("<p>a</p>", "a"));
    const note = await annotate("home", FIRST_BLOCK);
    await resolve(note.id);
    await updateAnnotation(
      MOCKUP,
      note.id,
      { status: "open" },
      defaultMockupsDir(),
    );
    await updateAnnotation(
      MOCKUP,
      note.id,
      { text: "reworded" },
      defaultMockupsDir(),
    );

    const [entry] = await stored();
    expect(entry.resolvedVersion).to.equal(undefined);
    expect((await served(note.id)).resolvedAt).to.equal(undefined);
  });

  it("serves a note written before versions as pinned on the newest version, and pins it where it is when the note is next written (fails when a legacy note has no version or keeps drifting)", async () => {
    await put(block("<p>a</p>", "a"));
    const note = await annotate("home", FIRST_BLOCK);
    await withoutVersions();
    expect((await served(note.id)).version).to.equal(1);

    await writeAsYou(block("<p>b</p>", "a"));
    expect((await served(note.id)).version).to.equal(2);
    await resolve(note.id);

    expect((await stored())[0]).to.include({ version: 2, resolvedVersion: 2 });
  });

  it("reads a version 2 file, whose notes have neither offset nor version, as pinned on the newest version (fails when the old file stops reading)", async () => {
    await put(block("<p>a</p>", "a"));
    await writeFile(
      annotationsPath(),
      JSON.stringify({
        version: 2,
        annotations: [
          {
            id: "old",
            anchor: { block: "a", steps: [] },
            text: "from before",
            status: "open",
            createdAt: "2026-11-01T10:00:00.000Z",
          },
        ],
      }),
    );

    expect(await served("old")).to.include({
      version: 1,
      path: FIRST_BLOCK,
    });
  });

  it("leaves a note without a version when the mockup has no history (fails when a number is invented)", async () => {
    const directory = join(defaultMockupsDir(), NAME);
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "spec.json"), JSON.stringify(spec()));

    const created = await createAnnotation(
      MOCKUP,
      { page: "home", text: "no history", offset: { x: 0, y: 0 } },
      defaultMockupsDir(),
    );

    expect(created.kind).to.equal("created");
    expect((await stored())[0].version).to.equal(undefined);
  });
});

describe("[unit] mockup annotation versions: by version", () => {
  useWorkspace();

  it("counts the notes pinned on each version, resolved ones included, and none for a version with no note (fails when a resolved note stops counting or counts on its resolving version)", async () => {
    await put(block("<p>a</p>", "a"));
    const first = await annotate("home", FIRST_BLOCK);
    await annotate("home", FIRST_BLOCK);
    await writeAsYou(block("<p>b</p>", "a"));
    await resolve(first.id);
    await writeAsYou(block("<p>c</p>", "a"));
    await annotate("home", FIRST_BLOCK);

    const counts = await countAnnotationsByVersion(MOCKUP, defaultMockupsDir());

    expect([...counts]).to.deep.equal([
      [1, 2],
      [3, 1],
    ]);
  });

  it("lists the notes of a version placed in that version's spec: a block since removed still has its pin there (fails when the pins are placed in the current spec)", async () => {
    await put(block("<p>a</p>", "a"), block("<p>b</p>", "b"));
    const onSecond = await annotate("home", "/pages/0/tree/1");
    await resolve(onSecond.id);
    await writeAsYou(block("<p>b</p>", "b"));
    await edit({ op: "remove", path: FIRST_BLOCK });

    const old = await readVersion(defaultMockupsDir(), MOCKUP, 1);
    const pins = await listVersionAnnotations(
      MOCKUP,
      1,
      old?.spec ?? {},
      defaultMockupsDir(),
    );

    expect(
      pins?.map(({ id, status, path }) => [id, status, path]),
    ).to.deep.equal([[onSecond.id, "resolved", "/pages/0/tree/1"]]);
    expect(
      await listVersionAnnotations(MOCKUP, 2, {}, defaultMockupsDir()),
    ).to.deep.equal([]);
  });

  it("serves version and resolvedVersion through the AI's annotation tools (fails when the tools drop the fields)", async () => {
    await put(block("<p>a</p>", "a"));
    const note = await annotate("home", FIRST_BLOCK);
    await writeAsYou(block("<p>b</p>", "a"));
    await answer(
      mockupTool("mockup_resolve_annotation"),
      { mockup: NAME, id: note.id },
      z.object({ resolvedVersion: z.number() }),
    );

    const listed = await answer(
      mockupTool("mockup_annotations"),
      { mockup: NAME, status: "resolved" },
      z.object({
        annotations: z.array(
          z.object({ version: z.number(), resolvedVersion: z.number() }),
        ),
      }),
    );

    expect(listed.annotations).to.deep.equal([
      { version: 1, resolvedVersion: 2 },
    ]);
  });
});
