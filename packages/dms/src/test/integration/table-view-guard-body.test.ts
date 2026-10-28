import type { AxiosInstance } from "axios";
import { expect } from "chai";
import { authorizedClient, registerUser } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";

const LOCATION = "/api/computed/tasks";
const HTTP_OK = 200;

interface Task {
  _id: string;
  title: string;
  spent?: number;
}

describe("[integration] table view guards amending the body", () => {
  let client: AxiosInstance;

  before(async () => {
    await resetDatabase();
    const owner = await registerUser({ owner: true });
    client = authorizedClient(owner.accessToken);
  });

  const listed = async (): Promise<Task[]> => {
    const response = await client.get<{ results: Task[] }>(
      `${LOCATION}/list?limit=50`,
    );
    expect(response.status, JSON.stringify(response.data)).to.equal(HTTP_OK);
    return response.data.results;
  };

  it("writes the field a new guard filled in", async () => {
    const created = await client.post(`${LOCATION}/new`, {
      title: "Plan",
      estimate: 4,
    });
    expect(created.status, JSON.stringify(created.data)).to.equal(HTTP_OK);
    const [task] = await listed();
    expect(task).to.include({ title: "Plan", spent: 0 });
  });

  it("writes the body an edit guard amended", async () => {
    const [task] = await listed();
    const edited = await client.put(`${LOCATION}/edit?id=${task!._id}`, {
      title: "  Ship  ",
    });
    expect(edited.status, JSON.stringify(edited.data)).to.equal(HTTP_OK);
    const [after] = await listed();
    expect(after).to.include({ title: "Ship", spent: 0 });
  });
});
