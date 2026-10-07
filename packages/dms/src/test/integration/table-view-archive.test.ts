import type { AxiosInstance } from "axios";
import { expect } from "chai";
import { authorizedClient, registerUser } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";

// Archive mode over the test host's notes (src/test/attachment-host/archive.ts):
// a note created without its archive field is active — the list filters with
// `ne true`, which the adapter matches on a missing field — and archive and
// restore move it between the two lists. Each list is asked the way the
// client asks it, `showArchived` set: a caller who may view archived rows and
// leaves it out is served both.

const LOCATION = "/api/archive/notes";
const HTTP_OK = 200;

interface Note {
  _id: string;
  title: string;
}

describe("[integration] table view archive mode", () => {
  let client: AxiosInstance;

  before(async () => {
    await resetDatabase();
    const owner = await registerUser({ owner: true });
    client = authorizedClient(owner.accessToken);
  });

  async function list(query = ""): Promise<Note[]> {
    const response = await client.get(`${LOCATION}/list?limit=50${query}`);
    expect(response.status, JSON.stringify(response.data)).to.equal(HTTP_OK);
    return response.data.results as Note[];
  }

  const titles = async (showArchived: boolean) =>
    (await list(`&showArchived=${showArchived}`))
      .map((note) => note.title)
      .sort();
  const ACTIVE = false;
  const ARCHIVED = true;

  it("lists a row whose archive field was never written as active", async () => {
    for (const title of ["Draft", "Plan"]) {
      const created = await client.post(`${LOCATION}/new`, { title });
      expect(created.status, JSON.stringify(created.data)).to.equal(HTTP_OK);
    }
    expect(await titles(ACTIVE)).to.deep.equal(["Draft", "Plan"]);
    expect(await titles(ARCHIVED)).to.deep.equal([]);
    expect(await list()).to.have.length(2);
  });

  it("moves a row to the archived list and back", async () => {
    const draft = (await list("&showArchived=false")).find(
      (note) => note.title === "Draft",
    );
    const archived = await client.put(`${LOCATION}/archive?ids=${draft!._id}`);
    expect(archived.status, JSON.stringify(archived.data)).to.equal(HTTP_OK);
    expect(await titles(ACTIVE)).to.deep.equal(["Plan"]);
    expect(await titles(ARCHIVED)).to.deep.equal(["Draft"]);

    const restored = await client.put(`${LOCATION}/restore?ids=${draft!._id}`);
    expect(restored.status, JSON.stringify(restored.data)).to.equal(HTTP_OK);
    expect(await titles(ACTIVE)).to.deep.equal(["Draft", "Plan"]);
    expect(await titles(ARCHIVED)).to.deep.equal([]);
  });
});
