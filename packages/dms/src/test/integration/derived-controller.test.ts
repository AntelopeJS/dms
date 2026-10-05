import { GetModel } from "@antelopejs/interface-database-decorators";
import { stripStagingPrefix } from "@antelopejs/interface-file-storage";
import type { AxiosInstance } from "axios";
import { expect } from "chai";
import { DEFAULT_TENANT_ID } from "@antelopejs/interface-dms/constants";
import { RoleModel } from "@antelopejs/interface-dms/db";
import { findUploadToken, uploadAttachment } from "../helpers/attachments";
import { authorizedClient, registerUser } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";

// `DerivedNoteController extends DataController(Note, {},
// Controller("/api/derived-controller/derived-notes", BaseNoteController))`:
// the same notes behind a second writing screen (src/test/attachment-host).

const BASE = "/api/derived-controller/base-notes";
const DERIVED = "/api/derived-controller/derived-notes";
const BASE_SLUG = "/base-notes";
const DERIVED_SLUG = "/derived-notes";
const DERIVED_TABLE = "derived-notes.content";
const BASE_TABLE = "base-notes.content";
const METADATA = "/api/files/metadata";
const HTTP_OK = 200;
const HTTP_FORBIDDEN = 403;

interface Note {
  _id: string;
  title: string;
  file?: string;
}

interface TableViewColumn {
  id: string;
}

async function ownerClient(): Promise<AxiosInstance> {
  const owner = await registerUser({ owner: true });
  return authorizedClient(owner.accessToken);
}

async function tableOptions(client: AxiosInstance, slug: string) {
  const layout = await client.get("/dms/pagelayout", { params: { slug } });
  expect(layout.status, JSON.stringify(layout.data)).to.equal(HTTP_OK);
  return layout.data.components.content.options;
}

async function listTitles(
  client: AxiosInstance,
  location: string,
  search?: string,
): Promise<string[]> {
  const list = await client.get(`${location}/list`, { params: { search } });
  expect(list.status, JSON.stringify(list.data)).to.equal(HTTP_OK);
  return (list.data.results as Note[]).map((note) => note.title);
}

/** A member holding the `add` action of one table view (and its page). */
async function memberAdding(table: string): Promise<AxiosInstance> {
  const page = table.split(".")[0];
  const [role] = await GetModel(RoleModel, DEFAULT_TENANT_ID).insert({
    name: `Adds through ${table}`,
    permissions: [page, table, `${table}.add`],
  });
  const member = await registerUser({ roles_ids: [role] });
  return authorizedClient(member.accessToken);
}

describe("[integration] a data controller derived from another", () => {
  beforeEach(resetDatabase);

  it("serves its routes at its own location, over the parent's rows", async () => {
    const client = await ownerClient();
    const created = await client.post(`${DERIVED}/new`, { title: "Alpha" });
    expect(created.status, JSON.stringify(created.data)).to.equal(HTTP_OK);
    await client.post(`${BASE}/new`, { title: "Beta" });

    expect(await listTitles(client, DERIVED)).to.have.members([
      "Alpha",
      "Beta",
    ]);
    expect(await listTitles(client, BASE)).to.have.members(["Alpha", "Beta"]);
  });

  it("inherits the parent's fields: mandatory, searchable, listed", async () => {
    const client = await ownerClient();
    const missingTitle = await client.post(`${DERIVED}/new`, {});
    expect(missingTitle.status).to.not.equal(HTTP_OK);
    await client.post(`${DERIVED}/new`, { title: "Alpha" });
    await client.post(`${DERIVED}/new`, { title: "Beta" });

    expect(await listTitles(client, DERIVED, "Alp")).to.deep.equal(["Alpha"]);
  });

  it("serves a working TableView of its own, next to the parent's writing one", async () => {
    const client = await ownerClient();
    const derived = await tableOptions(client, DERIVED_SLUG);
    const base = await tableOptions(client, BASE_SLUG);

    expect(derived.location).to.equal(DERIVED);
    expect(base.location).to.equal(BASE);
    expect(
      (derived.columns as TableViewColumn[]).map((column) => column.id),
    ).to.have.members(["title", "file"]);
    expect(derived.formComponents.new).to.not.equal(undefined);
    expect(derived.formComponents.edit).to.not.equal(undefined);
  });

  it("saves a file staged from its own TableView through its own routes", async () => {
    const client = await ownerClient();
    const { formComponents } = await tableOptions(client, DERIVED_SLUG);
    const token = findUploadToken(formComponents.new, `${DERIVED}#file`);
    expect(token).to.be.a("string");
    const upload = await uploadAttachment({
      client,
      content: Buffer.from("derived controller file"),
      mimetype: "text/plain",
      claims: {},
      filename: "note.txt",
      token,
    });

    const saved = await client.post(`${DERIVED}/new`, {
      title: "With a file",
      file: upload.key,
    });
    expect(saved.status, JSON.stringify(saved.data)).to.equal(HTTP_OK);
    const promoted = await client.get(METADATA, {
      params: { resourceKey: stripStagingPrefix(upload.key) },
    });
    expect(promoted.status, JSON.stringify(promoted.data)).to.equal(HTTP_OK);
  });

  it("guards its writes with its own TableView's permission", async () => {
    const throughDerived = await memberAdding(DERIVED_TABLE);
    const throughBase = await memberAdding(BASE_TABLE);

    expect(
      (await throughDerived.post(`${DERIVED}/new`, { title: "Mine" })).status,
    ).to.equal(HTTP_OK);
    expect(
      (await throughBase.post(`${DERIVED}/new`, { title: "Not mine" })).status,
    ).to.equal(HTTP_FORBIDDEN);
    expect(
      (await throughDerived.post(`${BASE}/new`, { title: "Not mine" })).status,
    ).to.equal(HTTP_FORBIDDEN);
  });
});
