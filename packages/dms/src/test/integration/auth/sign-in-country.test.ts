import type { AxiosInstance } from "axios";
import { expect } from "chai";
import { getAuthConfig, type SignInCountryConfig } from "../../../config";
import { resetCountryLookup } from "../../../utils";
import { authorizedClient, registerUser } from "../../helpers/auth";
import { resetDatabase } from "../../helpers/db";
import { createClient } from "../../helpers/http";
import { pageRoutePath } from "@antelopejs/interface-dms/page";

const COUNTRY_HEADER = "CF-IPCountry";
const CHROME_ON_WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const FIREFOX_ON_LINUX =
  "Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0";
const NEW_LOGIN_TITLE =
  "$dms.notifications.messages.new_login.title_browser_os";
const HTTP_OK = 200;
const POLL_INTERVAL_MS = 50;
const POLL_ATTEMPTS = 40;

interface StoredNotification {
  title: string;
  params: Record<string, string> | null;
}

const delay = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

describe("[integration] auth/sign-in country", () => {
  let previous: SignInCountryConfig | undefined;
  let email: string;
  let password: string;
  let owner: AxiosInstance;

  const signIn = async (country?: string, userAgent = CHROME_ON_WINDOWS) => {
    const headers = country
      ? { "user-agent": userAgent, [COUNTRY_HEADER]: country }
      : { "user-agent": userAgent };
    const response = await createClient().post(
      "/api/auth/login",
      { email, password },
      { headers },
    );
    expect(response.status, JSON.stringify(response.data)).to.equal(HTTP_OK);
  };

  const newSignInNotices = async (): Promise<StoredNotification[]> => {
    const response = await owner.get<StoredNotification[]>(
      pageRoutePath("/settings/user/notifications", "/list"),
    );
    expect(response.status).to.equal(HTTP_OK);
    return response.data.filter(
      (notification) => notification.title === NEW_LOGIN_TITLE,
    );
  };

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
    getAuthConfig().signInCountry = undefined;
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

  it("still alerts a new device when no country is known", async () => {
    await signIn(undefined, FIREFOX_ON_LINUX);
    const notices = await waitForNotices(3);
    expect(notices).to.have.length(3);
    expect(notices.some((notice) => !notice.params?.country)).to.equal(true);
  });
});
