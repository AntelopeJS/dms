const assert = require("node:assert/strict");
const { readdirSync, readFileSync } = require("node:fs");
const nodePath = require("node:path");
const join = nodePath.join.bind(nodePath);
const { satisfies, valid, validRange } = require("semver");
const { ACTIONS, TRIGGERS } = require("./backend-automation.cjs");
const { readJsonRecord, textAt } = require("./helpers/json-record.mjs");

const root = nodePath.resolve(__dirname, "..");

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

/**
 * @param {string} where
 * @param {{ properties?: Record<string, { title: string, description?: string }> }} schema
 * @returns {{ where: string, text: string }[]}
 */
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
  const messages = readJsonRecord(join(localeRoot, file));
  for (const key of [
    ...texts.map(({ text }) => text.slice(1)),
    "error.tenant_owner_required",
    "error.tenant_member_required",
  ]) {
    const message = textAt(messages, key) ?? "";
    assert.match(message, /\S/, `${file} must translate ${key}`);
  }
}

const components = readdirSync(
  join(root, "frontend-vue/layers/dms-layout/app/emails"),
)
  .filter((file) => file.endsWith(".vue"))
  .map((file) => nodePath.basename(file, ".vue"));
assert.deepEqual(components.sort(), emailNames.sort());

const lockfile = readFileSync(join(root, "../../pnpm-lock.yaml"), "utf8");
const locked = [
  ...lockfile.matchAll(
    /^ {2}'@antelopejs\/dms-frontend@([^'(]+)':\n((?: {4}.*\n)*)/gm,
  ),
].map(([, key, entry]) => entry.match(/^ {4}version: (\S+)$/m)?.[1] ?? key);
assert.notDeepEqual(locked, []);
for (const version of locked) {
  assert.notEqual(valid(version), null, `locked renderer ${version}`);
}
for (const layer of ["frontend-vue", "playground/frontend-vue"]) {
  const manifest = readJsonRecord(join(root, layer, "package.json"));
  const range = textAt(manifest, "engines.@antelopejs/dms-frontend") ?? "";
  assert.match(range, /./, `${layer} renderer range`);
  assert.notEqual(validRange(range), null, `${layer} renderer range`);
  for (const version of locked) {
    assert.ok(
      satisfies(version, range),
      `${layer} must admit renderer ${version}`,
    );
  }
}

process.stdout.write("Backend invariant checks passed.\n");
