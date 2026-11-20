import type { AxiosInstance } from "axios";
import { expect } from "chai";
import { authorizedClient, registerUser } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";

const LOCATION = "/api/archive/notes";
const HTTP_OK = 200;
const TITLES = ["Alpha", "Bravo", "Charlie"];

interface Note {
  _id: string;
  title: string;
}

describe("[integration] table view select by ids", () => {
  let client: AxiosInstance;
  let notes: Note[];

  before(async () => {
    await resetDatabase();
    const owner = await registerUser({ owner: true });
    client = authorizedClient(owner.accessToken);
    for (const title of TITLES) {
      const created = await client.post(`${LOCATION}/new`, { title });
      expect(created.status, JSON.stringify(created.data)).to.equal(HTTP_OK);
    }
    notes = await select("limit=50");
  });

  async function select(query: string): Promise<Note[]> {
    const response = await client.get<{ results: Note[] }>(
      `${LOCATION}/select?${query}`,
    );
    expect(response.status, JSON.stringify(response.data)).to.equal(HTTP_OK);
    return response.data.results;
  }

  const idOf = (title: string) =>
    notes.find((note) => note.title === title)!._id;
  const titlesOf = (rows: Note[]) => rows.map((row) => row.title).sort();

  it("answers only the rows the ids name", async () => {
    expect(notes).to.have.length(TITLES.length);
    const rows = await select(
      `ids=${idOf("Alpha")}&ids=${idOf("Charlie")}&limit=2`,
    );
    expect(titlesOf(rows)).to.deep.equal(["Alpha", "Charlie"]);
  });

  it("matches the ids on the selected field idKey names", async () => {
    const rows = await select("ids=Bravo&idKey=title");
    expect(titlesOf(rows)).to.deep.equal(["Bravo"]);
  });

  it("matches on the row id when idKey names a field the select hides", async () => {
    const rows = await select(`ids=${idOf("Bravo")}&idKey=isArchived`);
    expect(titlesOf(rows)).to.deep.equal(["Bravo"]);
  });

  it("answers no row for an unknown id", async () => {
    expect(await select("ids=missing")).to.deep.equal([]);
  });

  it("serves only the rows a picker's fixed filter keeps, and still labels the others", async () => {
    const archived = await client.put(
      `${LOCATION}/archive?ids=${idOf("Bravo")}`,
    );
    expect(archived.status, JSON.stringify(archived.data)).to.equal(HTTP_OK);

    const options = await select("filter_isArchived=ne:true&limit=50");
    expect(titlesOf(options)).to.deep.equal(["Alpha", "Charlie"]);
    const labels = await select(`ids=${idOf("Bravo")}`);
    expect(titlesOf(labels)).to.deep.equal(["Bravo"]);
  });
});
