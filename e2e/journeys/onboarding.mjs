import { booleanIn, stringIn } from "../rows.mjs";

/**
 * @typedef {import("@antelopejs/dms/e2e").Ctx} Ctx
 * @typedef {import("@antelopejs/dms/e2e").Tab} Tab
 * @typedef {ReturnType<typeof wizardAdmin>} Administrator
 */

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
    tab.visible({ role: "heading", name: "Welcome to AntelopeJS DMS" }),
  ]);
  await tab.fill({ role: "textbox", name: "Platform name" }, platformName);
  await tab.click({ role: "button", name: "Continue to administrator" });
  return tab;
}

async function fillAdministrator(/** @type {Tab} */ tab, /** @type {Administrator} */ admin, /** @type {string | undefined} */ setupToken) {
  if (setupToken) {
    await tab.fill({ role: "textbox", name: "Setup token" }, setupToken);
  }
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

/** The first-run wizard, on an empty database. */
export const journeys = [
  {
    id: "wizard-creates-admin",
    tag: "@smoke",
    title: "the wizard names the platform, creates the owner, signs it in, and the platform stays onboarded",
    entryPoint: "/onboarding wizard (Platform, Administrator, Ready)",
    onboard: false,
    async run(/** @type {Ctx} */ ctx) {
      const before = await informations(ctx, "a fresh platform is not onboarded");
      await ctx.verify("the empty platform reports it is not onboarded", [
        ctx.equal("has_onboarded", booleanIn(before.body, "has_onboarded"), false),
      ]);
      const platformName = ctx.unique("Verify Wizard");
      const admin = wizardAdmin(ctx);
      const tab = await openWizard(ctx, platformName);
      await fillAdministrator(tab, admin, ctx.setupToken());
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
        ctx.equal("has_onboarded", booleanIn(after.body, "has_onboarded"), true),
        ctx.status(me, 200),
        ctx.equal("the owner's email", stringIn(me.body, "email"), admin.email),
        ctx.equal("the owner flag", booleanIn(me.body, "owner"), true),
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
      await fillAdministrator(tab, { ...wizardAdmin(ctx), password: "weak" }, ctx.setupToken());
      await tab.click({ role: "button", name: "Create administrator account" });
      await ctx.verify("the wizard stays on the Administrator step with the rules", [
        tab.shows(/The password doesn’t meet every rule/),
        tab.shows(/At least 8 characters\s+not met/),
        tab.visible({ role: "heading", name: "Create the administrator account" }),
      ]);
      const after = await informations(ctx, "nothing was created");
      await ctx.verify("the platform is still not onboarded", [
        ctx.equal("has_onboarded", booleanIn(after.body, "has_onboarded"), false),
      ]);
    },
  },
  {
    id: "wizard-reads-the-setup-token-from-the-address",
    title: "the wizard takes the token from the address, drops it from the URL and registers without asking for it",
    entryPoint: "/onboarding?token=<setup token>",
    onboard: false,
    async run(/** @type {Ctx} */ ctx) {
      const tab = await ctx.tab("anon", "visitor");
      await tab.goto(`/onboarding?token=${ctx.setupToken()}`);
      await tab.click({ role: "button", name: "Continue to administrator" });
      await ctx.verify("the address no longer carries the token and the wizard does not ask for it", [
        tab.at(/^\/onboarding$/),
        tab.visible({ role: "heading", name: "Create the administrator account" }),
        tab.visible({ role: "textbox", name: "Setup token" }, { hidden: true }),
      ]);
      const admin = wizardAdmin(ctx);
      await fillAdministrator(tab, admin);
      await tab.click({ role: "button", name: "Create administrator account" });
      const after = await informations(ctx, "the platform is onboarded");
      await ctx.verify("the registration went through with the token from the address", [
        tab.visible({ role: "button", name: "Open the dashboard" }),
        ctx.equal("has_onboarded", booleanIn(after.body, "has_onboarded"), true),
      ]);
    },
  },
];
