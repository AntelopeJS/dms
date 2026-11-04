import type { AttachmentField } from "@antelopejs/interface-dms/attachments";
import { expect } from "chai";
import {
  type AttachmentReference,
  collectAttachments,
  SaveComponentFiles,
} from "../../../attachments";
import { untouchedRequestContext } from "../../helpers/request-context";

const FILE: AttachmentField = { id: "doc", key: "doc", kind: "file" };
const IMAGE: AttachmentField = { id: "logo", key: "logo", kind: "image" };

type Nested = string | Nested[];
type NestedObject = string | { a: NestedObject };

const WIDTH = 200_000;
const WIDE_BODY_MS = 2_000;
const WIDE_SAVE_MS = 10_000;
const MIB = 1024 * 1024;
const BODY_AND_ARRAY_LEVELS = 2;

function keys(references: AttachmentReference[]): string[] {
  return references.map(({ key }) => key);
}

function indexedKeys(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `k${index}`);
}

function nestedElement(levels: number, leaf: string): NestedObject {
  let element: NestedObject = leaf;
  for (let level = 0; level < levels; level += 1) element = { a: element };
  return element;
}

function wideAndDeepElements(levels: number): NestedObject[] {
  const elements: NestedObject[] = [];
  let size = 0;
  while (size < MIB) {
    const element = nestedElement(levels, `k${elements.length}`);
    elements.push(element);
    size += JSON.stringify(element).length + 1;
  }
  return elements;
}

function timed<Result>(run: () => Result) {
  const started = performance.now();
  const result = run();
  return { result, ms: performance.now() - started };
}

describe("[unit] attachments/fields collectAttachments", () => {
  it("reads a file field as its nonempty string", () => {
    expect(keys(collectAttachments([FILE], { doc: "a" }))).to.deep.equal(["a"]);
    expect(keys(collectAttachments([FILE], { doc: "" }))).to.deep.equal([]);
    expect(keys(collectAttachments([FILE], { doc: 5 }))).to.deep.equal([]);
    expect(keys(collectAttachments([FILE], {}))).to.deep.equal([]);
  });

  it("walks nested containers in document order and lists each key once", () => {
    const doc = { doc: ["a", { x: "b", y: ["c", "a"] }, "d"] };
    expect(keys(collectAttachments([FILE], doc))).to.deep.equal([
      "a",
      "b",
      "c",
      "d",
    ]);
  });

  it("reads an image field from its key and does not descend into it", () => {
    expect(
      keys(
        collectAttachments([IMAGE], {
          logo: { key: "k", other: { key: "z" } },
        }),
      ),
    ).to.deep.equal(["k"]);
    expect(
      keys(
        collectAttachments([IMAGE], { logo: { key: "", other: { key: "z" } } }),
      ),
    ).to.deep.equal([]);
    expect(
      keys(collectAttachments([IMAGE], { logo: { key: 3 } })),
    ).to.deep.equal([]);
  });

  it("finds images inside arrays and plain containers, ignoring bare strings", () => {
    const doc = { logo: ["s", { key: "a" }, { nested: { key: "b" } }] };
    expect(keys(collectAttachments([IMAGE], doc))).to.deep.equal(["a", "b"]);
  });

  it("keeps the fields apart and tags each reference with its field", () => {
    const references = collectAttachments([FILE, IMAGE], {
      doc: "a",
      logo: { key: "b" },
    });
    expect(references).to.deep.equal([
      { key: "a", field: FILE },
      { key: "b", field: IMAGE },
    ]);
  });

  it("walks a body nested ten thousand levels deep without exhausting the stack", () => {
    const depth = 10_000;
    let nested: Nested = "deep";
    for (let level = 0; level < depth; level += 1) nested = [nested];
    expect(keys(collectAttachments([FILE], { doc: nested }))).to.deep.equal([
      "deep",
    ]);
  });

  describe("walks a wide body without a size limit of its own", () => {
    it("reads an array of two hundred thousand strings in order", () => {
      const expected = indexedKeys(WIDTH);
      const { result, ms } = timed(() =>
        collectAttachments([FILE], { doc: expected }),
      );
      expect(keys(result)).to.deep.equal(expected);
      expect(ms).to.be.below(WIDE_BODY_MS);
    });

    it("reads an object of two hundred thousand entries in order", () => {
      const expected = indexedKeys(WIDTH);
      const wide = Object.fromEntries(expected.map((key) => [key, key]));
      const { result, ms } = timed(() =>
        collectAttachments([FILE], { doc: wide }),
      );
      expect(keys(result)).to.deep.equal(expected);
      expect(ms).to.be.below(WIDE_BODY_MS);
    });

    it("reads an array of two hundred thousand image references", () => {
      const expected = indexedKeys(WIDTH);
      const { result, ms } = timed(() =>
        collectAttachments([IMAGE], {
          logo: expected.map((key) => ({ key })),
        }),
      );
      expect(keys(result)).to.deep.equal(expected);
      expect(ms).to.be.below(WIDE_BODY_MS);
    });
  });

  describe("saves a wide body through SaveComponentFiles", () => {
    async function saveWide(logo: string[] | Record<string, string>) {
      const started = performance.now();
      const saved = await SaveComponentFiles(
        {
          context: untouchedRequestContext(),
          componentIds: [],
          fields: [IMAGE],
          before: {},
          submitted: { logo },
        },
        async (document) => ({ document, result: document }),
      );
      expect(performance.now() - started).to.be.below(WIDE_SAVE_MS);
      return saved;
    }

    it("answers an array of two hundred thousand entries", async () => {
      const logo = indexedKeys(WIDTH);
      expect((await saveWide(logo)).logo).to.deep.equal(logo);
    });

    it("answers an object of two hundred thousand entries", async () => {
      const logo = Object.fromEntries(indexedKeys(WIDTH).map((k) => [k, k]));
      expect((await saveWide(logo)).logo).to.deep.equal(logo);
    });
  });

  describe("walks a one MiB body of deeply nested elements", () => {
    for (const depth of [63, 64]) {
      it(`reads every element when the body nests ${depth} levels deep`, () => {
        const elements = wideAndDeepElements(depth - BODY_AND_ARRAY_LEVELS);
        const { result, ms } = timed(() =>
          collectAttachments([FILE], { doc: elements }),
        );
        expect(keys(result)).to.deep.equal(indexedKeys(elements.length));
        expect(ms).to.be.below(WIDE_BODY_MS);
      });
    }
  });

  describe("reads a document's own fields only", () => {
    for (const name of ["constructor", "toString", "__proto__"]) {
      it(`${name} reads as absent`, () => {
        const field: AttachmentField = { id: name, key: name, kind: "file" };
        expect(keys(collectAttachments([field], {}))).to.deep.equal([]);
      });
    }

    it("ignores a field the document only inherits", () => {
      const inherited = { __proto__: { doc: "leaked" } };
      expect(keys(collectAttachments([FILE], inherited))).to.deep.equal([]);
    });

    it("still reads an own field named like an Object.prototype key", () => {
      const field: AttachmentField = {
        id: "constructor",
        key: "constructor",
        kind: "file",
      };
      expect(
        keys(collectAttachments([field], { constructor: "mine" })),
      ).to.deep.equal(["mine"]);
    });
  });
});
