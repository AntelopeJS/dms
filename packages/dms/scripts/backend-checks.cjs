const assert = require("node:assert/strict");
const { readdirSync, readFileSync } = require("node:fs");
const { join, resolve, basename } = require("node:path");
const { satisfies, validRange } = require("semver");
const { ACTIONS } = require("../dist/automation/actions");
const { TRIGGERS } = require("../dist/automation/triggers");

const root = resolve(__dirname, "..");
const localeRoot = join(root, "frontend-vue/layers/dms-core/i18n/locales");
const locales = ["core-en-GB.json", "core-fr-FR.json"];
const emailNames = [
  "EmailAdminInvite",
  "EmailChangeNotice",
  "EmailChangeVerification",
  "EmailExportReady",
  "EmailResetPassword",
  "EmailTwoFactor",
  "EmailUserValidation",
];

function schemaTexts(where, schema) {
  return Object.entries(schema.properties ?? {}).flatMap(([name, property]) => [
    { where: `${where}.${name}.title`, text: property.title },
    ...(property.description === undefined
      ? []
      : [
          { where: `${where}.${name}.description`, text: property.description },
        ]),
  ]);
}

const texts = [
  ...TRIGGERS.flatMap((trigger) => [
    { where: `${trigger.id}.name`, text: trigger.name },
    { where: `${trigger.id}.description`, text: trigger.description },
    ...schemaTexts(`${trigger.id}.config`, trigger.configSchema),
    ...schemaTexts(`${trigger.id}.output`, trigger.outputSchema),
  ]),
  ...ACTIONS.flatMap((action) => [
    { where: `${action.id}.name`, text: action.name },
    { where: `${action.id}.description`, text: action.description },
    ...schemaTexts(`${action.id}.input`, action.inputSchema),
    ...schemaTexts(`${action.id}.output`, action.outputSchema),
  ]),
];

for (const { where, text } of texts) {
  assert.match(
    text,
    /^\$dms\.automation\./,
    `${where} must use an automation locale key`,
  );
}

for (const file of locales) {
  const messages = JSON.parse(readFileSync(join(localeRoot, file), "utf8"));
  for (const key of [
    ...texts.map(({ text }) => text.slice(1)),
    "error.tenant_owner_required",
    "error.tenant_member_required",
  ]) {
    const message = key
      .split(".")
      .reduce((node, part) => node?.[part], messages);
    assert.match(message, /\S/, `${file} must translate ${key}`);
  }
}

const components = readdirSync(
  join(root, "frontend-vue/layers/dms-layout/app/emails"),
)
  .filter((file) => file.endsWith(".vue"))
  .map((file) => basename(file, ".vue"));
assert.deepEqual(components.sort(), emailNames.sort());

const lockfile = readFileSync(join(root, "../../pnpm-lock.yaml"), "utf8");
const locked = [
  ...lockfile.matchAll(/^ {2}'@antelopejs\/dms-frontend@([^'(]+)':$/gm),
].map(([, version]) => version);
assert.notDeepEqual(locked, []);
for (const layer of ["frontend-vue", "playground/frontend-vue"]) {
  const manifest = JSON.parse(
    readFileSync(join(root, layer, "package.json"), "utf8"),
  );
  const range = manifest.engines?.["@antelopejs/dms-frontend"];
  assert.match(range, /./, `${layer} renderer range`);
  assert.notEqual(validRange(range), null, `${layer} renderer range`);
  for (const version of locked) {
    assert.ok(
      satisfies(version, range),
      `${layer} must admit renderer ${version}`,
    );
  }
}

function checkDist(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) checkDist(path);
    else if (entry.name.endsWith(".js")) {
      assert.ok(
        !/(?:require\(|import\()\s*["']@antelopejs\/dms/.test(
          readFileSync(path, "utf8"),
        ),
        `${path} imports its own package`,
      );
    }
  }
}

checkDist(join(root, "dist"));
process.stdout.write("Backend invariant checks passed.\n");
