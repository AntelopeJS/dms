// The data-api entry first: `components` and the entry require each other,
// and loading `components` first leaves the entry reading it half built.
import "@antelopejs/interface-data-api";
import { GetMetadata } from "@antelopejs/interface-core";
import { Query } from "@antelopejs/interface-data-api/components";
import {
  Access,
  AccessMode,
  DataAPIMeta,
  Mandatory,
  ModifierKey,
} from "@antelopejs/interface-data-api/metadata";
import {
  Field,
  LocalizationModifier,
  Localized,
  Table,
} from "@antelopejs/interface-database-decorators";
import { expect } from "chai";
import {
  clearedMandatoryFields,
  isClearingValue,
  parseEditBody,
  scopeWritableToBody,
  writableFieldsInBody,
  writeFieldsInBody,
} from "@antelopejs/interface-dms/base/table-view/partial-edit";

class StoredProbe {}

class ProbeController {
  @Mandatory("new", "edit")
  @Access(AccessMode.ReadWrite)
  declare name: string;

  @Access(AccessMode.ReadWrite)
  declare note: string | null;

  @Access(AccessMode.ReadWrite)
  declare tags: string[];

  @Access(AccessMode.ReadWrite)
  declare isOwner: boolean;

  @Mandatory("new")
  @Access(AccessMode.ReadWrite)
  declare code: string;

  @Access(AccessMode.ReadOnly)
  declare createdAt: string;

  declare table: Record<string, unknown>;

  @Access(AccessMode.WriteOnly)
  set secret(value: string) {
    this.table.secretHash = `hashed:${value}`;
  }
}

class LocalizedRow extends Table.with(LocalizationModifier) {
  @Field("string") declare _id: string;

  @Localized()
  @Field("string")
  declare title: string;

  @Localized()
  @Field("string")
  declare summary: string;

  @Field("string") declare status: string;
}

class LocalizedController {
  @ModifierKey(LocalizationModifier)
  declare language: string;

  @Access(AccessMode.ReadWrite)
  declare title: string;

  @Access(AccessMode.ReadWrite)
  declare summary: string;

  @Access(AccessMode.ReadWrite)
  declare status: string;
}

function storedLocalizedRow(): Record<string, unknown> {
  return {
    _id: "row-2",
    status: "open",
    _internal: {
      meta: {},
      data: {
        title: { en: "Title", fr: "Titre" },
        summary: { en: "Summary", fr: "Résumé" },
      },
    },
  };
}

async function writeLocalizedEdit(
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const meta = GetMetadata(LocalizedController, DataAPIMeta);
  meta.tableClass = LocalizedRow;
  const controller = new LocalizedController();
  controller.language = "en";
  return writeFieldsInBody(controller, meta, body, storedLocalizedRow());
}

function localizedData(row: Record<string, unknown>): Record<string, unknown> {
  return (row._internal as { data: Record<string, unknown> }).data;
}

function probeMeta(): DataAPIMeta {
  const meta = GetMetadata(ProbeController, DataAPIMeta);
  meta.tableClass = StoredProbe;
  return meta;
}

function storedRow(): Record<string, unknown> {
  return {
    _id: "row-1",
    name: "Stored name",
    note: "Stored note",
    tags: ["a", "b"],
    isOwner: true,
    code: "C-1",
    createdAt: "2026-01-01",
    secretHash: "hashed:old",
  };
}

async function writeEdit(
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const meta = probeMeta();
  return Query.WriteProperties(
    new ProbeController(),
    scopeWritableToBody(meta, body),
    body,
    "edit",
    storedRow(),
  );
}

function expectHttpError(run: () => unknown, status: number): void {
  try {
    run();
  } catch (error) {
    expect((error as { status?: number }).status).to.equal(status);
    return;
  }
  expect.fail(`expected an HTTP ${status} error`);
}

describe("TableView partial edit", () => {
  describe("isClearingValue", () => {
    it("treats null, an empty string and an empty list as clearing", () => {
      expect(isClearingValue(null)).to.equal(true);
      expect(isClearingValue("")).to.equal(true);
      expect(isClearingValue([])).to.equal(true);
    });

    it("keeps falsy but real values", () => {
      expect(isClearingValue(false)).to.equal(false);
      expect(isClearingValue(0)).to.equal(false);
      expect(isClearingValue(" ")).to.equal(false);
      expect(isClearingValue(["x"])).to.equal(false);
      expect(isClearingValue({})).to.equal(false);
    });
  });

  describe("clearedMandatoryFields", () => {
    const fields = () => probeMeta().fields;

    it("does not list a mandatory field the body leaves out", () => {
      expect(clearedMandatoryFields(fields(), { note: "x" })).to.deep.equal([]);
    });

    it("lists a mandatory field the body clears", () => {
      expect(clearedMandatoryFields(fields(), { name: null })).to.deep.equal([
        "name",
      ]);
      expect(clearedMandatoryFields(fields(), { name: "" })).to.deep.equal([
        "name",
      ]);
    });

    it("accepts a mandatory field the body sets", () => {
      expect(
        clearedMandatoryFields(fields(), { name: "New name" }),
      ).to.deep.equal([]);
    });

    it("ignores optional fields and fields mandatory for another action", () => {
      expect(
        clearedMandatoryFields(fields(), { note: null, tags: [], code: null }),
      ).to.deep.equal([]);
      expect(
        clearedMandatoryFields(fields(), { code: null }, "new"),
      ).to.deep.equal(["code"]);
    });
  });

  describe("writableFieldsInBody", () => {
    it("keeps only the props and setters the body carries", () => {
      const writable = probeMeta().writable._default;
      const scoped = writableFieldsInBody(writable, {
        note: "x",
        secret: "s",
        unknown: 1,
      });
      expect(scoped.props.map(([key]) => key)).to.deep.equal(["note"]);
      expect(scoped.setters.map(([key]) => key)).to.deep.equal(["secret"]);
    });
  });

  describe("scopeWritableToBody with Query.WriteProperties", () => {
    it("changes only the keys of a partial body", async () => {
      const written = await writeEdit({ note: "New note" });
      expect({ ...written }).to.deep.equal({
        ...storedRow(),
        note: "New note",
      });
    });

    it("clears a field sent as null or as an empty list", async () => {
      const written = await writeEdit({ note: null, tags: [] });
      expect(written.note).to.equal(null);
      expect(written.tags).to.deep.equal([]);
      expect(written.name).to.equal("Stored name");
      expect(written.isOwner).to.equal(true);
    });

    it("writes false, which is a value and not an absence", async () => {
      const written = await writeEdit({ isOwner: false });
      expect(written.isOwner).to.equal(false);
      expect(written.tags).to.deep.equal(["a", "b"]);
    });

    it("runs a setter only when the body carries its key", async () => {
      expect((await writeEdit({ note: "x" })).secretHash).to.equal(
        "hashed:old",
      );
      expect((await writeEdit({ secret: "new" })).secretHash).to.equal(
        "hashed:new",
      );
    });

    it("never writes a read-only field", async () => {
      const written = await writeEdit({ createdAt: "2030-01-01" });
      expect(written.createdAt).to.equal("2026-01-01");
    });

    it("leaves the controller metadata untouched", async () => {
      const meta = probeMeta();
      const before = meta.writable._default.props.map(([key]) => key);
      await writeEdit({ note: "x" });
      expect(meta.writable._default.props.map(([key]) => key)).to.deep.equal(
        before,
      );
      expect(meta.writable.edit).to.equal(undefined);
    });

    it("writes every writable field when the body carries them all", async () => {
      const written = await writeEdit({
        name: "N",
        note: "O",
        tags: ["t"],
        isOwner: false,
        code: "C-2",
      });
      expect(written).to.include({
        name: "N",
        note: "O",
        isOwner: false,
        code: "C-2",
      });
      expect(written.tags).to.deep.equal(["t"]);
    });
  });

  describe("writeFieldsInBody on localized fields", () => {
    it("keeps every language of a localized field the body leaves out", async () => {
      const written = await writeLocalizedEdit({ status: "closed" });
      expect(written.status).to.equal("closed");
      expect(localizedData(written)).to.deep.equal(
        localizedData(storedLocalizedRow()),
      );
    });

    it("writes the request language of a localized field the body sets", async () => {
      const written = await writeLocalizedEdit({ title: "New title" });
      expect(localizedData(written).title).to.deep.equal({
        en: "New title",
        fr: "Titre",
      });
      expect(localizedData(written).summary).to.deep.equal({
        en: "Summary",
        fr: "Résumé",
      });
      expect(written.status).to.equal("open");
    });

    it("clears only the request language of a localized field sent as null", async () => {
      const written = await writeLocalizedEdit({ summary: null });
      expect(localizedData(written).summary).to.deep.equal({
        en: null,
        fr: "Résumé",
      });
      expect(localizedData(written).title).to.deep.equal({
        en: "Title",
        fr: "Titre",
      });
    });
  });

  describe("parseEditBody", () => {
    it("reads a JSON object from a buffer or a string", () => {
      expect(parseEditBody(Buffer.from('{"a":1}'))).to.deep.equal({ a: 1 });
      expect(parseEditBody('{"a":null}')).to.deep.equal({ a: null });
    });

    it("refuses a body that is not a JSON object", () => {
      expectHttpError(() => parseEditBody("[1,2]"), 400);
      expectHttpError(() => parseEditBody('"text"'), 400);
      expectHttpError(() => parseEditBody("{not json"), 400);
    });
  });
});
