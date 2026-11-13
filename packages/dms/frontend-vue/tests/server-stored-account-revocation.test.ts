import { describe, expect, it } from "vitest";
import { readSealedCookie } from "@antelopejs/dms-frontend/templates/vue/server/auth/session.mjs";
import { isObject } from "../layers/dms-core/app/utils/type-check";
import { createServerRoutesFixture } from "./helpers/server-routes-fixture";
import {
  EXPIRED_EMAIL,
  REVOKED_EMAIL,
  calls,
} from "./helpers/server-routes-fixtures";

const ACCOUNT_COOKIE = /^dms_account_([0-9a-f]{32})_/;

/** The cookies of one browser, kept and dropped as a browser does. */
class Browser {
  private readonly cookies = new Map<string, string>();

  constructor(private readonly base: string) {}

  async ask(path: string, init: { method?: string; body?: unknown } = {}) {
    calls.length = 0;
    const response = await fetch(`${this.base}${path}`, {
      method: init.method ?? "POST",
      headers: {
        origin: this.base,
        "content-type": "application/json",
        cookie: [...this.cookies]
          .map(([name, value]) => `${name}=${value}`)
          .join("; "),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      redirect: "manual",
    });
    const body: unknown = await response.json().catch(() => null);
    for (const header of response.headers.getSetCookie()) {
      const [pair, ...attributes] = header.split("; ");
      const separator = pair.indexOf("=");
      const name = pair.slice(0, separator);
      const value = pair.slice(separator + 1);
      if (!value || attributes.includes("Max-Age=0")) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
    return { status: response.status, body, calls: [...calls] };
  }

  signIn(email: string) {
    return this.ask("/auth/login", {
      body: { email, password: "secret", keep_login: true },
    });
  }

  /** The stored accounts, by the id each account cookie is named after. */
  accounts(): string[] {
    return [...this.cookies.keys()].flatMap(
      (name) => ACCOUNT_COOKIE.exec(name)?.[1] ?? [],
    );
  }

  /** The accounts the index lists, by the same id. */
  indexed(): string[] {
    const index = readSealedCookie(
      { headers: { cookie: this.pairOf("dms_account_index_") } },
      "dms_account_index",
    );
    return isObject(index)
      ? Object.keys(index).map((id) => id.replaceAll("-", ""))
      : [];
  }

  signedIn(): boolean {
    return this.pairOf("dms_session_") !== "";
  }

  private pairOf(prefix: string): string {
    const name = [...this.cookies.keys()].find((key) => key.startsWith(prefix));
    return name ? `${name}=${this.cookies.get(name)}` : "";
  }
}

describe("a stored account whose session the backend revoked", () => {
  const fixture = createServerRoutesFixture();
  const browser = () => new Browser(fixture.moduleRoutes.url);

  it("is forgotten with the session when its renewal is refused, and no other account", async () => {
    const tab = browser();
    await tab.signIn("ada@example.test");
    await tab.signIn(REVOKED_EMAIL);
    const [kept, revoked] = tab.accounts();
    expect(revoked).toBeDefined();
    const renewal = await tab.ask("/api/_auth/session");
    expect(renewal.calls.map((call) => call.path)).toEqual([
      "/api/auth/refresh",
    ]);
    expect(tab.signedIn()).toBe(false);
    expect(tab.accounts()).toEqual([kept]);
    expect(tab.indexed()).toEqual([kept]);
  });

  it("is refused and forgotten when switched to or validated, and no other account", async () => {
    const refusals = [
      ["switch-account", { status: 401 }],
      ["validate-account", { status: 200, body: { valid: false } }],
    ] as const;
    for (const [action, refusal] of refusals) {
      const tab = browser();
      await tab.signIn(REVOKED_EMAIL);
      await tab.signIn("ada@example.test");
      const [revoked, kept] = tab.accounts();
      const answer = await tab.ask(`/auth/${action}`, {
        body: {
          accountId: revoked.replace(
            /^(.{8})(.{4})(.{4})(.{4})(.{12})$/,
            "$1-$2-$3-$4-$5",
          ),
        },
      });
      expect(answer, action).toMatchObject(refusal);
      expect(tab.signedIn(), action).toBe(true);
      expect(tab.accounts(), action).toEqual([kept]);
      expect(tab.indexed(), action).toEqual([kept]);
    }
  });
});

describe("a sign-out with an expired access token", () => {
  const fixture = createServerRoutesFixture();

  it("renews it and revokes the backend session all the same", async () => {
    const tab = new Browser(fixture.moduleRoutes.url);
    await tab.signIn("ada@example.test");
    await tab.signIn(EXPIRED_EMAIL);
    const [kept] = tab.accounts();
    const ended = await tab.ask("/api/_auth/session", { method: "DELETE" });
    expect(ended.calls.map((call) => call.path)).toEqual([
      "/api/auth/logout",
      "/api/auth/refresh",
      "/api/auth/logout",
    ]);
    expect(ended.calls[2].authorization).not.toBe(ended.calls[0].authorization);
    expect(tab.signedIn()).toBe(false);
    expect(tab.accounts()).toEqual([kept]);
  });
});
