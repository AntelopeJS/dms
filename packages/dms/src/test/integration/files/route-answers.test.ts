import { stripStagingPrefix } from "@antelopejs/interface-file-storage";
import { expect } from "chai";
import {
  nativeUploadToken,
  parseSavedDocument,
  uploadAttachment,
} from "../../helpers/attachments";
import { authorizedClient, registerUser } from "../../helpers/auth";
import { resetDatabase } from "../../helpers/db";
import type { BodyResponse } from "../../helpers/parse-body";

const LOCATION = "/api/native-attachments";
const CONTENT = Buffer.from("route answer");
const HTTP_OK = 200;

function answerOf({ status, data }: BodyResponse) {
  return { status, body: data };
}

async function ownerClient() {
  const user = await registerUser({ owner: true });
  return authorizedClient(user.accessToken);
}

async function stagedKey(
  client: Awaited<ReturnType<typeof ownerClient>>,
  field: "file" | "files",
) {
  const upload = await uploadAttachment({
    client,
    content: CONTENT,
    mimetype: "text/plain",
    claims: {},
    filename: "answer.txt",
    token: await nativeUploadToken(client, field),
  });
  return upload.key;
}

describe("[integration] file-bearing table routes answer what the route answers", () => {
  beforeEach(resetDatabase);

  it("answers the saved row from new and from every edit", async () => {
    const client = await ownerClient();
    const first = await stagedKey(client, "file");
    const created = await client.post(`${LOCATION}/new`, {
      file: first,
      files: [],
      readerId: "r1",
    });
    const { _id } = parseSavedDocument(created);
    const row = {
      _id,
      id: _id,
      readerId: "r1",
      file: stripStagingPrefix(first),
      files: [],
      publicFile: null,
      image: null,
      gallery: null,
    };
    expect(answerOf(created)).to.deep.equal({ status: HTTP_OK, body: row });

    const second = await stagedKey(client, "file");
    const replaced = await client.put(
      `${LOCATION}/edit`,
      { file: second },
      { params: { id: _id } },
    );
    expect(answerOf(replaced)).to.deep.equal({
      status: HTTP_OK,
      body: { ...row, file: stripStagingPrefix(second) },
    });

    const cleared = await client.put(
      `${LOCATION}/edit`,
      { file: "" },
      { params: { id: _id } },
    );
    expect(answerOf(cleared)).to.deep.equal({
      status: HTTP_OK,
      body: { ...row, file: "" },
    });

    const renamed = await client.put(
      `${LOCATION}/edit`,
      { readerId: "r2" },
      { params: { id: _id } },
    );
    expect(answerOf(renamed)).to.deep.equal({
      status: HTTP_OK,
      body: { ...row, file: "", readerId: "r2" },
    });
  });

  it("answers the deleted-row count from delete, and 404 from an edit of a missing row", async () => {
    const client = await ownerClient();
    const keys = [
      await stagedKey(client, "files"),
      await stagedKey(client, "files"),
    ];
    const { _id } = parseSavedDocument(
      await client.post(`${LOCATION}/new`, { files: keys }),
    );
    const removed = await client.delete(`${LOCATION}/delete`, {
      params: { id: _id },
    });
    expect(answerOf(removed)).to.deep.equal({ status: HTTP_OK, body: 1 });
    const absent = await client.delete(`${LOCATION}/delete`, {
      params: { id: "absent" },
    });
    expect(answerOf(absent)).to.deep.equal({ status: HTTP_OK, body: "" });
    const edited = await client.put(
      `${LOCATION}/edit`,
      { file: "" },
      { params: { id: "absent" } },
    );
    expect(answerOf(edited)).to.deep.equal({
      status: 404,
      body: "Not Found",
    });
  });

  it("answers the refusal of a forbidden key", async () => {
    const client = await ownerClient();
    const forbidden = await client.post(`${LOCATION}/new`, {
      file: "legacy/unclassified.txt",
    });
    expect(answerOf(forbidden)).to.deep.equal({
      status: 403,
      body: "File access denied.",
    });
  });
});
