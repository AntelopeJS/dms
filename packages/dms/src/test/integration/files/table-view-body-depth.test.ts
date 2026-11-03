import { expect } from "chai";
import { authorizedClient, registerUser } from "../../helpers/auth";
import { resetDatabase } from "../../helpers/db";

const NEW_ROUTE = "/api/native-attachments/new";
const BODY_BYTES = 1024 * 1024;
const WIDE_ENTRIES = 200_000;
const TOO_DEEP = 10_000;
const HTTP_BAD_REQUEST = 400;
const REFUSAL = "The JSON body nests more than 64 levels deep.";

/**
 * Time limit of the wide and wide-and-deep requests. The decoder answers them
 * in well under a second; the level-by-level schema it replaced took 11 s on
 * 1 MiB and ran the process out of heap on a 65-deep one.
 */
const REPLY_LIMIT_MS = 5_000;
const TEST_TIMEOUT_MS = 60_000;

const CONTAINERS = ["array", "object"] as const;
type Container = (typeof CONTAINERS)[number];

function nest(container: Container, levels: number) {
  return container === "array"
    ? `${"[".repeat(levels)}${"]".repeat(levels)}`
    : `${'{"a":'.repeat(levels)}1${"}".repeat(levels)}`;
}

/** `{"files":[E,...]}` of about 1 MiB; E holds `levels` containers, so the body is `levels + 2` deep. */
function wideBody(container: Container, levels: number) {
  const element = nest(container, levels);
  const count = Math.floor(BODY_BYTES / (element.length + 1));
  return `{"files":[${Array(count).fill(element).join(",")}]}`;
}

describe("[integration] the table-view save route bounds the depth of its body", function () {
  this.timeout(TEST_TIMEOUT_MS);

  beforeEach(resetDatabase);

  async function post(body: string) {
    const user = await registerUser({ owner: true });
    const client = authorizedClient(user.accessToken);
    const started = performance.now();
    const response = await client.post(NEW_ROUTE, body, {
      headers: { "Content-Type": "application/json" },
      maxBodyLength: Infinity,
    });
    return {
      response,
      milliseconds: performance.now() - started,
    };
  }

  for (const container of CONTAINERS) {
    it(`answers 400 to a body ${TOO_DEEP} ${container} levels deep`, async () => {
      const { response } = await post(
        `{"files":${nest(container, TOO_DEEP - 1)}}`,
      );
      expect(response.status, JSON.stringify(response.data)).to.equal(
        HTTP_BAD_REQUEST,
      );
      expect(JSON.stringify(response.data)).to.contain(REFUSAL);
    });

    it(`answers 400 to 1 MiB of ${container} elements 65 levels deep, within the time limit`, async () => {
      const { response, milliseconds } = await post(wideBody(container, 63));
      expect(response.status, JSON.stringify(response.data)).to.equal(
        HTTP_BAD_REQUEST,
      );
      expect(JSON.stringify(response.data)).to.contain(REFUSAL);
      expect(milliseconds).to.be.lessThan(REPLY_LIMIT_MS);
    });

    it(`gives 1 MiB of ${container} elements 64 levels deep its normal answer, within the time limit`, async () => {
      const { response, milliseconds } = await post(wideBody(container, 62));
      expect(JSON.stringify(response.data)).not.to.contain(REFUSAL);
      expect(response.status).to.be.lessThan(500);
      expect(milliseconds).to.be.lessThan(REPLY_LIMIT_MS);
    });
  }

  it("gives 200k entries in one array its normal answer, within the time limit", async () => {
    const { response, milliseconds } = await post(
      `{"files":[${Array(WIDE_ENTRIES).fill('"x"').join(",")}]}`,
    );
    expect(JSON.stringify(response.data)).not.to.contain(REFUSAL);
    expect(response.status).to.be.lessThan(500);
    expect(milliseconds).to.be.lessThan(REPLY_LIMIT_MS);
  });

  it("gives 200k entries in one object its normal answer, within the time limit", async () => {
    const entries = Array.from(
      { length: WIDE_ENTRIES },
      (_, index) => `"k${index}":"x"`,
    ).join(",");
    const { response, milliseconds } = await post(`{"files":{${entries}}}`);
    expect(JSON.stringify(response.data)).not.to.contain(REFUSAL);
    expect(response.status).to.be.lessThan(500);
    expect(milliseconds).to.be.lessThan(REPLY_LIMIT_MS);
  });
});
