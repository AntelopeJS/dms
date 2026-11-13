import type { AxiosInstance } from "axios";
import { expect } from "chai";
import { authorizedClient, registerUser } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";

const LOCATION = "/api/archive/notes";
const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;

interface Note {
  _id: string;
  title: string;
  isArchived?: boolean;
}

describe("[integration] table view archive mode", () => {
  let client: AxiosInstance;

  before(async () => {
    await resetDatabase();
    const owner = await registerUser({ owner: true });
    client = authorizedClient(owner.accessToken);
  });

  async function list(query = ""): Promise<Note[]> {
    const response = await client.get<{ results: Note[] }>(
      `${LOCATION}/list?limit=50${query}`,
    );
    expect(response.status, JSON.stringify(response.data)).to.equal(HTTP_OK);
    return response.data.results;
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

    const [archivedNote] = await list("&showArchived=true");
    expect(archivedNote?.isArchived).to.equal(true);

    const restored = await client.put(`${LOCATION}/restore?ids=${draft!._id}`);
    expect(restored.status, JSON.stringify(restored.data)).to.equal(HTTP_OK);
    expect(await titles(ACTIVE)).to.deep.equal(["Draft", "Plan"]);
    expect(await titles(ARCHIVED)).to.deep.equal([]);
  });

  it("filters the archive field by the boolean a list filter spells", async () => {
    const plan = (await list()).find((note) => note.title === "Plan");
    const archived = await client.put(`${LOCATION}/archive?ids=${plan!._id}`);
    expect(archived.status, JSON.stringify(archived.data)).to.equal(HTTP_OK);

    const filtered = async (filter: string) =>
      (await list(`&filter_isArchived=${filter}`))
        .map((note) => note.title)
        .sort();
    expect(await filtered("eq:true")).to.deep.equal(["Plan"]);
    expect(await filtered("ne:true")).to.deep.equal(["Draft"]);
    expect(await filtered("eq:false")).to.deep.equal(["Draft"]);
  });

  it("refuses an archive filter that is not true or false", async () => {
    const response = await client.get(
      `${LOCATION}/list?filter_isArchived=eq:yes`,
      { validateStatus: () => true },
    );
    expect(response.status).to.equal(HTTP_BAD_REQUEST);
  });
});
