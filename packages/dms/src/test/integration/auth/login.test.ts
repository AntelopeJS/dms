import { expect } from "chai";
import { registerUser } from "../../helpers/auth";
import { resetDatabase } from "../../helpers/db";
import { createClient } from "../../helpers/http";

// SKIPPED: depends on seeding state in-process (helpers/fixtures) that the
// route handlers cannot see. Under `ajs module test`, mocha-loaded test code and
// the runtime-loaded module get separate interface-database instances, so an
// invite seeded via GetModel is invisible to the signup route. See TESTING.md.
describe.skip("[integration] auth/login", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("logs in a registered user and returns a bearer token", async () => {
    const user = await registerUser();

    const client = createClient();
    const response = await client.post("/api/auth/login", {
      email: user.email,
      password: user.password,
    });

    expect(response.status).to.equal(200);
    expect(response.data.token_type).to.equal("Bearer");
    expect(response.data.access_token).to.be.a("string").and.not.empty;
    expect(response.data.refresh_token).to.be.a("string").and.not.empty;
    expect(response.data.user?.email).to.equal(user.email);
  });

  it("rejects a wrong password with 401", async () => {
    const user = await registerUser();

    const client = createClient();
    const response = await client.post("/api/auth/login", {
      email: user.email,
      password: "WrongPassw0rd!",
    });

    expect(response.status).to.equal(401);
  });

  it("rejects an unknown email with 401", async () => {
    const client = createClient();
    const response = await client.post("/api/auth/login", {
      email: "nobody@test.local",
      password: "WhateverP@ss1",
    });

    expect(response.status).to.equal(401);
  });

  it("rejects a malformed payload with 400", async () => {
    const client = createClient();
    const response = await client.post("/api/auth/login", {
      email: "not-an-email",
      password: "x",
    });

    expect(response.status).to.equal(400);
  });

  it("rejects a missing password with 400", async () => {
    const client = createClient();
    const response = await client.post("/api/auth/login", {
      email: "user@test.local",
    });

    expect(response.status).to.equal(400);
  });
});
