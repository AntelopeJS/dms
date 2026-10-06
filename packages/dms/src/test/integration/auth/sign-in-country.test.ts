import type { AxiosInstance } from "axios";
import { expect } from "chai";
import { getAuthConfig, type SignInCountryConfig } from "../../../config";
import { resetCountryLookup } from "../../../utils/sign-in-country";
import { authorizedClient, registerUser } from "../../helpers/auth";
import { resetDatabase } from "../../helpers/db";
import { createClient } from "../../helpers/http";

// The "New sign-in" check reads a sign-in's country through the proxy header
// the deployment names: the same browser and system from another country is
// a new sign-in, and its notice names the country, not the address.

const COUNTRY_HEADER = "CF-IPCountry";
const CHROME_ON_WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const NEW_LOGIN_TITLE =
  "$dms.notifications.messages.new_login.title_browser_os";
const HTTP_OK = 200;
const POLL_INTERVAL_MS = 50;
const POLL_ATTEMPTS = 40;

interface StoredNotification {
  title: string;
  params: Record<string, string> | null;
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("[integration] auth/sign-in country", () => {
  let previous: SignInCountryConfig | undefined;
  let email: string;
  let password: string;
  let owner: AxiosInstance;

  const signIn = async (country: string) => {
    const response = await createClient().post(
      "/api/auth/login",
      { email, password },
      {
        headers: {
          "user-agent": CHROME_ON_WINDOWS,
          [COUNTRY_HEADER]: country,
        },
      },
    );
    expect(response.status, JSON.stringify(response.data)).to.equal(HTTP_OK);
  };

  const newSignInNotices = async (): Promise<StoredNotification[]> => {
    const response = await owner.get("/settings/user/notifications/list");
    expect(response.status).to.equal(HTTP_OK);
    return (response.data as StoredNotification[]).filter(
      (notification) => notification.title === NEW_LOGIN_TITLE,
    );
  };

  // The notice is sent in the background of the sign-in.
  const waitForNotices = async (count: number) => {
    for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
      const notices = await newSignInNotices();
      if (notices.length >= count) return notices;
      await delay(POLL_INTERVAL_MS);
    }
    return newSignInNotices();
  };

  before(async () => {
    previous = getAuthConfig().signInCountry;
    getAuthConfig().signInCountry = { header: COUNTRY_HEADER, database: false };
    resetCountryLookup();
    await resetDatabase();
    const user = await registerUser({ owner: true });
    ({ email, password } = user);
    owner = authorizedClient(user.accessToken);
  });

  after(() => {
    getAuthConfig().signInCountry = previous;
    resetCountryLookup();
  });

  it("names the country of a device signing in from a new one, never the address", async () => {
    await signIn("FR");
    const [first] = await waitForNotices(1);
    expect(first.params?.country).to.equal("France");
    expect(first.params).to.not.have.property("ip");
  });

  it("stays quiet when the device signs in again from the same country", async () => {
    await signIn("FR");
    await delay(POLL_INTERVAL_MS * 4);
    expect(await newSignInNotices()).to.have.length(1);
  });

  it("alerts when the same browser and system sign in from another country", async () => {
    await signIn("BR");
    const notices = await waitForNotices(2);
    expect(notices).to.have.length(2);
    expect(notices.map((notice) => notice.params?.country)).to.include(
      "Brazil",
    );
  });
});
