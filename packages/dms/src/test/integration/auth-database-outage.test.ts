import axios, { type AxiosInstance } from "axios";
import { expect } from "chai";
import { MongoMemoryReplSet } from "mongodb-memory-server-core";
import { parseAuthBody } from "../helpers/auth";
import { MONGO_BINARY_VERSION } from "../helpers/harness-modules";
import { ReplicaProcess } from "../helpers/replica-process";

const TEST_TIMEOUT_MS = 240_000;
const SETUP_TOKEN = "auth-outage-setup-token-0123456789abcdef";
const OWNER = { email: "owner@outage.test", password: "OutagePassw0rd!" };
const NO_PROVISIONING_HOLD_MS = 0;
const ANSWER_WITHIN_MS = 8000;
const SIGNED_IN_ROUTES = [
  "/api/auth/me",
  "/dms/sitelayout",
  "/dms/permissions",
  "/dms/page?path=/settings/workspace/members",
  "/api/tables/roles/select",
];
const HTTP_OK = 200;
const HTTP_UNAUTHORIZED = 401;
const HTTP_SERVICE_UNAVAILABLE = 503;

function replicaClient(replica: ReplicaProcess): AxiosInstance {
  return axios.create({
    baseURL: replica.baseUrl,
    validateStatus: () => true,
    headers: { "x-antelopejs-namespace": "default" },
  });
}

async function timedGet(client: AxiosInstance, path: string, token: string) {
  const started = Date.now();
  const response = await client.get(path, {
    headers: { authorization: `Bearer ${token}` },
  });
  return { status: response.status, elapsedMs: Date.now() - started };
}

describe("[integration] auth while the database is down", function () {
  this.timeout(TEST_TIMEOUT_MS);

  let mongod: MongoMemoryReplSet;
  let replica: ReplicaProcess;
  let client: AxiosInstance;
  let accessToken: string;

  before(async () => {
    mongod = await MongoMemoryReplSet.create({
      replSet: { count: 1 },
      binary: { version: MONGO_BINARY_VERSION },
    });
    replica = await ReplicaProcess.start(
      "auth-outage",
      NO_PROVISIONING_HOLD_MS,
      { mongoUrl: mongod.getUri(), env: { DMS_SETUP_TOKEN: SETUP_TOKEN } },
    );
    await replica.started();
    client = replicaClient(replica);

    const registered = await client.post("/api/onboarding/register", {
      ...OWNER,
      firstName: "Outage",
      lastName: "Owner",
      setupToken: SETUP_TOKEN,
    });
    expect(registered.status, JSON.stringify(registered.data)).to.equal(
      HTTP_OK,
    );
    accessToken = parseAuthBody(
      await client.post("/api/auth/login", OWNER),
    ).access_token;
    for (const path of SIGNED_IN_ROUTES) {
      expect((await timedGet(client, path, accessToken)).status, path).to.equal(
        HTTP_OK,
      );
    }

    await mongod.stop({ doCleanup: false });
  });

  after(async () => {
    await replica?.remove();
    await mongod?.stop();
  });

  for (const path of SIGNED_IN_ROUTES) {
    it(`refuses a signed-in GET ${path} with a 503 within a few seconds`, async () => {
      const { status, elapsedMs } = await timedGet(client, path, accessToken);

      expect(
        { status, inTime: elapsedMs < ANSWER_WITHIN_MS },
        `answered after ${elapsedMs} ms`,
      ).to.deep.equal({ status: HTTP_SERVICE_UNAVAILABLE, inTime: true });
    });
  }

  it("still refuses a token whose signature does not check out with a 401", async () => {
    const forged = `${accessToken.slice(0, -4)}AAAA`;

    const { status } = await timedGet(client, "/api/auth/me", forged);

    expect(status).to.equal(HTTP_UNAUTHORIZED);
  });
});
