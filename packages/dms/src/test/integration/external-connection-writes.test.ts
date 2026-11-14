import type { AxiosInstance, AxiosResponse } from "axios";
import { expect } from "chai";
import {
  type ConnectionAccess,
  RegisterConnectionAccessSource,
} from "@antelopejs/interface-dms/connection-access";
import { authorizedClient, registerUser } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";

const LOCATION = "/api/external/countries";
const HTTP_OK = 200;
const HTTP_FORBIDDEN = 403;
const READ_ONLY = 'Connection "erp" is read-only';

interface Country {
  _id: string;
  name: string;
}

let access: ConnectionAccess | undefined;

function expectStatus(response: AxiosResponse, status: number): void {
  expect(response.status, JSON.stringify(response.data)).to.equal(status);
}

function expectReadOnly(response: AxiosResponse): void {
  expectStatus(response, HTTP_FORBIDDEN);
  expect(String(response.data)).to.include(READ_ONLY);
}

describe("[integration] a data controller over an external connection follows its access", () => {
  let client: AxiosInstance;
  let country: Country;

  const list = async () => {
    const response = await client.get<{ results: Country[] }>(
      `${LOCATION}/list?limit=50&showArchived=false`,
    );
    expectStatus(response, HTTP_OK);
    return response.data.results.map(({ name }) => name).sort();
  };
  const create = (name: string) =>
    client.post<Country>(`${LOCATION}/new`, { name });
  const edit = (name: string) =>
    client.put(`${LOCATION}/edit?id=${country._id}`, { name });
  const archive = () => client.put(`${LOCATION}/archive?ids=${country._id}`);
  const restore = () => client.put(`${LOCATION}/restore?ids=${country._id}`);
  const remove = () =>
    client.delete(`${LOCATION}/delete`, { params: { id: country._id } });

  before(async () => {
    await resetDatabase();
    RegisterConnectionAccessSource("test-erp", (connection) =>
      connection === "erp" ? access : undefined,
    );
    const owner = await registerUser({ owner: true });
    client = authorizedClient(owner.accessToken);
    access = "read-write";
    const created = await create("France");
    expectStatus(created, HTTP_OK);
    country = created.data;
  });

  it("refuses every write while the access is read, a raw Form posting to its routes included, and still lists", async () => {
    access = "read";
    expectReadOnly(await create("Spain"));
    expectReadOnly(await edit("République française"));
    expectReadOnly(await archive());
    expectReadOnly(await restore());
    expectReadOnly(await remove());
    expect(await list()).to.deep.equal(["France"]);
  });

  it("refuses every write while no source answers for the connection", async () => {
    access = undefined;
    expectReadOnly(await create("Spain"));
    expectReadOnly(await edit("République française"));
    expect(await list()).to.deep.equal(["France"]);
  });

  it("writes once the access is read-write", async () => {
    access = "read-write";
    expectStatus(await create("Spain"), HTTP_OK);
    expectStatus(await edit("Republic of France"), HTTP_OK);
    expect(await list()).to.deep.equal(["Republic of France", "Spain"]);
    expectStatus(await archive(), HTTP_OK);
    expectStatus(await restore(), HTTP_OK);
    expectStatus(await archive(), HTTP_OK);
    expectStatus(await remove(), HTTP_OK);
    expect(await list()).to.deep.equal(["Spain"]);
  });
});
