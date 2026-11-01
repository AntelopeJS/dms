import { isMemberRow, issuePaths, listOf } from "../rows.mjs";

/**
 * @typedef {import("../../../../packages/dms/bin/control/journey.mjs").JourneyContext} Ctx
 * @typedef {import("../../../../packages/dms/bin/control/tab.mjs").Tab} Tab
 * @typedef {ReturnType<typeof wizardAdmin>} Administrator
 */

const REGISTER = "/api/onboarding/register";
const INFORMATIONS = "/api/onboarding/informations";
const POLICY_PASSWORD = "WizardPass1!";

function wizardAdmin(/** @type {Ctx} */ ctx) {
  return {
    email: ctx.email("wizard"),
    firstName: "Wiz",
    lastName: "Ard",
    password: POLICY_PASSWORD,
  };
}

async function openWizard(/** @type {Ctx} */ ctx, /** @type {string} */ platformName) {
  const tab = await ctx.tab("anon", "visitor");
  await tab.goto("/");
  await ctx.verify("a fresh platform opens the setup wizard", [
    tab.at(/^\/onboarding/),
    tab.visible({ role: "heading", name: "Welcome to Antelope DMS" }),
  ]);
  await tab.fill({ role: "textbox", name: "Platform name" }, platformName);
  await tab.click({ role: "button", name: "Continue to administrator" });
  return tab;
}

async function fillAdministrator(/** @type {Tab} */ tab, /** @type {Administrator} */ admin) {
  await tab.fill({ role: "textbox", name: "First name" }, admin.firstName);
  await tab.fill({ role: "textbox", name: "Last name" }, admin.lastName);
  await tab.fill({ role: "textbox", name: "Work e-mail" }, admin.email);
  await tab.fill({ role: "textbox", name: "Password", exact: true }, admin.password);
}

async function informations(/** @type {Ctx} */ ctx, /** @type {string} */ label) {
  return ctx.api(label, { method: "GET", path: INFORMATIONS, as: "anon" });
}

async function signInAs(/** @type {Ctx} */ ctx, /** @type {string} */ name, /** @type {{ email: string, password: string }} */ credentials) {
  ctx.addAccount(name, credentials);
  return ctx.api(`sign in as ${name}`, { method: "GET", path: "/api/auth/me", as: name });
}

/** The first-run wizard and the onboarding API, each on an empty database. */
export const journeys = [
  {
    id: "wizard-creates-admin",
    title: "the wizard names the platform, creates the owner, signs it in, and the platform stays onboarded",
    entryPoint: "/onboarding wizard (Platform, Administrator, Ready)",
    onboard: false,
    async run(/** @type {Ctx} */ ctx) {
      const before = await informations(ctx, "a fresh platform is not onboarded");
      await ctx.verify("the empty platform reports it is not onboarded", [
        ctx.equal("has_onboarded", before.body?.has_onboarded, false),
      ]);
      const platformName = ctx.unique("Verify Wizard");
      const admin = wizardAdmin(ctx);
      const tab = await openWizard(ctx, platformName);
      await fillAdministrator(tab, admin);
      await tab.click({ role: "button", name: "Create administrator account" });
      await ctx.verify("the Ready step names the platform and the owner", [
        tab.visible({ role: "heading", name: `${platformName} is ready` }),
        tab.shows(/You're signed in as Wiz Ard, owner of the platform/),
      ]);
      await tab.click({ role: "button", name: "Open the dashboard" });
      await ctx.verify("the dashboard opens signed in", [tab.at(/^\/(?!onboarding|auth)/)]);
      const after = await informations(ctx, "the platform is onboarded");
      const me = await signInAs(ctx, "wizard", { email: admin.email, password: admin.password });
      await ctx.verify("the API reads back one onboarded owner", [
        ctx.equal("has_onboarded", after.body?.has_onboarded, true),
        ctx.status(me, 200),
        ctx.equal("the owner's email", me.body?.email, admin.email),
        ctx.equal("the owner flag", me.body?.owner, true),
      ]);
      const visitor = await ctx.tab("stranger");
      await visitor.goto("/onboarding");
      await ctx.verify("the wizard is closed and sign-in names the platform it created", [
        visitor.at(/^\/auth/),
        visitor.shows(new RegExp(`Sign in to the ${platformName} workspace`)),
      ]);
    },
  },
  {
    id: "wizard-refuses-weak-password",
    title: "the wizard lists the unmet password rules and creates nobody",
    entryPoint: "/onboarding wizard, Administrator step",
    onboard: false,
    async run(/** @type {Ctx} */ ctx) {
      const tab = await openWizard(ctx, ctx.unique("Verify Weak"));
      await fillAdministrator(tab, { ...wizardAdmin(ctx), password: "weak" });
      await tab.click({ role: "button", name: "Create administrator account" });
      await ctx.verify("the wizard stays on the Administrator step with the rules", [
        tab.shows(/The password doesn’t meet every rule/),
        tab.shows(/At least 8 characters\s+not met/),
        tab.visible({ role: "heading", name: "Create the administrator account" }),
      ]);
      const after = await informations(ctx, "nothing was created");
      await ctx.verify("the platform is still not onboarded", [
        ctx.equal("has_onboarded", after.body?.has_onboarded, false),
      ]);
    },
  },
  {
    id: "register-rejects-invalid-body",
    title: "POST /api/onboarding/register answers 400 with the invalid fields and creates nobody",
    entryPoint: "POST /api/onboarding/register",
    onboard: false,
    async run(/** @type {Ctx} */ ctx) {
      const answer = await ctx.api("register an invalid administrator", {
        method: "POST",
        path: REGISTER,
        as: "anon",
        body: { email: "not-an-email", firstName: "", lastName: "E", password: POLICY_PASSWORD },
      });
      const paths = issuePaths(answer.body);
      const after = await informations(ctx, "nothing was created");
      await ctx.verify("the request is refused field by field", [
        ctx.status(answer, 400),
        ctx.holds("email is named", paths.includes("email"), JSON.stringify(paths)),
        ctx.holds("firstName is named", paths.includes("firstName"), JSON.stringify(paths)),
        ctx.equal("has_onboarded", after.body?.has_onboarded, false),
      ]);
    },
  },
  {
    id: "register-refused-once-onboarded",
    title: "a second registration after onboarding is refused and the first owner stays the only one",
    entryPoint: "POST /api/onboarding/register",
    onboard: true,
    async run(/** @type {Ctx} */ ctx) {
      const second = await ctx.api("register a second administrator", {
        method: "POST",
        path: REGISTER,
        as: "anon",
        body: { email: ctx.email("second"), firstName: "Second", lastName: "Owner", password: POLICY_PASSWORD },
      });
      const members = await ctx.api("list the members", { method: "GET", path: "/api/tables/members/list" });
      const owners = listOf(members.body, isMemberRow).filter((member) => member.isTenantOwner);
      await ctx.verify("the platform keeps its one owner", [
        ctx.status(second, 400),
        ctx.equal("error", second.body, "error.admin_already_set"),
        ctx.equal("owners", owners.map((owner) => owner.email), [ctx.adminCredentials().email]),
      ]);
      await ctx.restartBackend();
      const after = await informations(ctx, "onboarding survives a restart");
      await ctx.verify("the platform is still onboarded after a backend restart", [
        ctx.equal("has_onboarded", after.body?.has_onboarded, true),
      ]);
    },
  },
  {
    id: "concurrent-registers-one-owner",
    title: "two registrations sent at once leave exactly one platform owner (formal-onboarding-bootstrap AtMostOneOwner)",
    entryPoint: "POST /api/onboarding/register, twice concurrently",
    onboard: false,
    async run(/** @type {Ctx} */ ctx) {
      const admins = ["first", "second"].map((/** @type {string} */ name) => ({
        email: ctx.email(name),
        firstName: name,
        lastName: "Racer",
        password: POLICY_PASSWORD,
      }));
      const answers = await ctx.concurrent(
        "register",
        admins.map((/** @type {Administrator} */ admin) => ({ method: "POST", path: REGISTER, body: admin })),
      );
      const accepted = answers.filter((answer) => answer.status === 200).length;
      const owners = [];
      const refusedButCreated = [];
      for (const [index, admin] of admins.entries()) {
        const me = await signInAs(ctx, `racer${index}`, admin);
        if (me.status === 200 && me.body?.owner) owners.push(admin.email);
        if (me.status === 200 && answers[index].status !== 200) refusedButCreated.push(admin.email);
      }
      const after = await informations(ctx, "the platform after the race");
      await ctx.verify("exactly one registration wins and a refused one leaves no account", [
        ctx.equal("accepted registrations", accepted, 1),
        ctx.equal("platform owners", owners.length, 1),
        ctx.equal("accounts created by a refused registration", refusedButCreated, []),
        ctx.equal("has_onboarded", after.body?.has_onboarded, true),
      ]);
    },
  },
];
