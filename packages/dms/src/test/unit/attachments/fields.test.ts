import type { AttachmentField } from "@antelopejs/interface-dms/attachments";
import { expect } from "chai";
import {
  type AttachmentReference,
  collectAttachments,
} from "../../../attachments";

const FILE: AttachmentField = { id: "doc", key: "doc", kind: "file" };
const IMAGE: AttachmentField = { id: "logo", key: "logo", kind: "image" };

type Nested = string | Nested[];

function keys(references: AttachmentReference[]): string[] {
  return references.map(({ key }) => key);
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
