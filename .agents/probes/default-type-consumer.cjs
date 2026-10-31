const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

/** @typedef {typeof import("../../packages/interface-dms/node_modules/typescript")} TypeScript */

/** Orders strings by UTF-16 code unit, the order `sort()` uses with no comparator.
 * @param {string} left
 * @param {string} right
 */
function byCodeUnit(left, right) {
  if (left < right) return -1;
  return left > right ? 1 : 0;
}

/** @type {typeof import("../../packages/interface-dms/node_modules/zod")} */
const { z } = require(path.join(__dirname, '../../packages/interface-dms/node_modules/zod'));
const PackageManifest = z.object({
  name: z.string(),
  version: z.string().optional(),
  peerDependencies: z.record(z.string(), z.string()).optional(),
});

const referenceCommit = '2bac38976877c3e6ac94cedf9552988bd245cf87';
const packageName = '@antelopejs/interface-dms';
const owners = {
  'default-options': {
    aliases: ['NumberTypeOptions', 'StringTypeOptions', 'DateTypeOptions', 'BooleanTypeOptions', 'SelectTypeOptions', 'EmailTypeOptions', 'ColorTypeOptions', 'PasswordTypeOptions', 'UrlTypeOptions', 'PhoneTypeOptions', 'RichTextTypeOptions', 'StringTimeTypeOptions'],
    classes: [],
  },
  'default-numbers': {
    aliases: ['NumberType', 'StringType', 'DateType'],
    classes: ['NumberType', 'StringType', 'DateType'],
  },
  'default-choices': {
    aliases: ['BooleanType', 'SelectType', 'PriceType', 'PercentageType'],
    classes: ['BooleanType', 'SelectType', 'PriceType', 'PercentageType'],
  },
  'default-strings': {
    aliases: ['EmailType', 'ColorType', 'PasswordType', 'UrlType', 'PhoneType'],
    classes: ['EmailType', 'ColorType', 'PasswordType', 'UrlType', 'PhoneType'],
  },
  'default-relations': {
    aliases: ['RelationFilterBy', 'RelationType', 'CascaderRelationType'],
    classes: ['RelationType', 'CascaderRelationType'],
  },
  'default-address': {
    aliases: ['Address', 'AddressAutocomplete', 'AddressType'],
    classes: ['AddressType'],
  },
  'default-files': {
    aliases: ['RichTextType', 'StringTimeType', 'FileTypeOptions', 'FileType', 'ImageValue', 'ImageTypeOptions', 'ImageType'],
    classes: ['RichTextType', 'StringTimeType', 'FileType', 'ImageType'],
  },
};
const aliases = Object.values(owners).flatMap((owner) => owner.aliases);
const classes = Object.values(owners).flatMap((owner) => owner.classes);
const displays = ['SelectDisplay', 'BooleanDisplay'];
const expectedFunctions = [
  ...aliases.map((name) => `identity${name}`),
  ...classes.map((name) => `constructor${name}`),
  ...displays.map((name) => `identity${name}`),
  'makeNumber',
];

/**
 * @param {string} command
 * @param {string[]} args
 * @param {string} cwd
 * @param {string} logFile
 * @returns {string}
 */
function run(command, args, cwd, logFile) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, CI: 'true' },
  });
  fs.appendFileSync(logFile, `${JSON.stringify({ command, args, cwd })}\n${result.stdout || ''}${result.stderr || ''}\n`);
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `${command} failed. See ${logFile}`);
  return result.stdout.trim();
}

/**
 * @param {TypeScript} ts
 * @param {string} declaration
 */
function declarationCoverage(ts, declaration) {
  const source = ts.createSourceFile('default-type-consumer.d.ts', declaration, ts.ScriptTarget.Latest, true);
  const functions = source.statements.filter(ts.isFunctionDeclaration).map((statement) => {
    const specifiers = [...statement.getText(source).matchAll(/import\(["']([^"']+)["']\)/g)].map((match) => match[1]);
    return { name: statement.name.text, specifiers: [...new Set(specifiers)].sort(byCodeUnit) };
  });
  assert.deepEqual(functions.map((entry) => entry.name).sort(), [...expectedFunctions].sort());
  const specifiers = [...new Set(functions.flatMap((entry) => entry.specifiers))].sort(byCodeUnit);
  const defaultSubpaths = specifiers.filter((specifier) =>
    specifier.startsWith(`${packageName}/base/data-types/internal/default-`) ||
    specifier.startsWith(`${packageName}/base/data-types/default/`),
  ).map((specifier) => ({
    specifier,
    kind: specifier.includes('/internal/') ? 'internal' : 'public',
    functions: functions.filter((entry) => entry.specifiers.includes(specifier)).map((entry) => entry.name),
  }));
  return { functions, specifiers, defaultSubpaths };
}

function main() {
  assert.equal(process.argv.length, 4, 'Usage: node default-type-consumer.cjs <checkout-root> <output-directory>');
  const checkoutRoot = fs.realpathSync(process.argv[2]);
  const outputDirectory = path.resolve(process.argv[3]);
  const packageRoot = path.join(checkoutRoot, 'packages/interface-dms');
  const packageJson = PackageManifest.parse(JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8')));
  assert.equal(packageJson.name, packageName);
  const tsPackagePath = require.resolve('typescript/package.json', { paths: [packageRoot, checkoutRoot] });
  const tsPackage = PackageManifest.parse(JSON.parse(fs.readFileSync(tsPackagePath, 'utf8')));
  assert.equal(tsPackage.version, '6.0.3', 'The checkout must supply TypeScript 6.0.3');
  const tsRoot = path.dirname(tsPackagePath);
  /** @type {TypeScript} */
  const ts = require(path.join(tsRoot, 'lib/typescript.js'));
  const fixturePath = path.join(__dirname, 'fixtures/default-type-consumer.ts');
  const fixture = fs.readFileSync(fixturePath, 'utf8');
  assert.equal(aliases.length, 37);
  assert.equal(classes.length, 19);
  const source = ts.createSourceFile(fixturePath, fixture, ts.ScriptTarget.Latest, true);
  const fixtureFunctions = source.statements.filter(ts.isFunctionDeclaration).map((statement) => statement.name.text);
  assert.deepEqual(fixtureFunctions.sort(), [...expectedFunctions].sort());
  fs.mkdirSync(outputDirectory, { recursive: true });
  const logFile = path.join(outputDirectory, 'default-type-consumer.log');
  fs.writeFileSync(logFile, '');
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'default-type-consumer-'));
  try {
    const packDirectory = path.join(scratch, 'pack');
    const consumer = path.join(scratch, 'consumer');
    fs.mkdirSync(packDirectory);
    fs.mkdirSync(consumer);
    run('pnpm', ['pack', '--pack-destination', packDirectory], packageRoot, logFile);
    const tarballs = fs.readdirSync(packDirectory).filter((file) => file.endsWith('.tgz'));
    assert.equal(tarballs.length, 1, 'Expected exactly one packed tarball');
    const tarball = path.join(packDirectory, tarballs[0]);
    const consumerPackage = {
      name: 'default-type-consumer-probe',
      version: '0.0.0',
      private: true,
      type: 'module',
      dependencies: { ...packageJson.peerDependencies, [packageName]: `file:${tarball}` },
    };
    fs.writeFileSync(path.join(consumer, 'package.json'), `${JSON.stringify(consumerPackage, null, 2)}\n`);
    fs.writeFileSync(path.join(consumer, 'default-type-consumer.ts'), fixture);
    const compilerOptions = {
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'bundler',
      declaration: true,
      emitDeclarationOnly: true,
      strict: true,
      skipLibCheck: true,
      types: [],
      outDir: './emitted',
    };
    fs.writeFileSync(path.join(consumer, 'tsconfig.json'), `${JSON.stringify({ compilerOptions, files: ['./default-type-consumer.ts'] }, null, 2)}\n`);
    run('pnpm', ['install', '--ignore-scripts', '--no-frozen-lockfile'], consumer, logFile);
    if (fs.existsSync(path.join(consumer, 'node_modules', packageName, 'dist/base/data-types/default/address.js'))) {
      const importOrder = run(process.execPath, [path.join(__dirname, 'default-type-import-order.cjs'), consumer], consumer, logFile);
      fs.writeFileSync(path.join(outputDirectory, 'default-type-import-order.json'), importOrder);
    }
    run(process.execPath, [path.join(tsRoot, 'lib/tsc.js'), '--project', path.join(consumer, 'tsconfig.json')], consumer, logFile);
    const declarationPath = path.join(consumer, 'emitted/default-type-consumer.d.ts');
    const declaration = fs.readFileSync(declarationPath, 'utf8');
    assert.ok(!declaration.includes('/internal/'), 'Consumer declarations must not freeze internal paths');
    const observed = declarationCoverage(ts, declaration);
    fs.copyFileSync(declarationPath, path.join(outputDirectory, 'default-type-consumer.d.ts'));
    fs.copyFileSync(path.join(consumer, 'pnpm-lock.yaml'), path.join(outputDirectory, 'default-type-consumer.pnpm-lock.yaml'));
    const manifest = {
      referenceCommit,
      checkoutRoot,
      checkoutHead: run('git', ['rev-parse', 'HEAD'], checkoutRoot, logFile),
      packageName,
      packageVersion: packageJson.version,
      typescriptVersion: tsPackage.version,
      compilerOptions,
      fixtureSha256: createHash('sha256').update(fixture).digest('hex'),
      tarballSha256: createHash('sha256').update(fs.readFileSync(tarball)).digest('hex'),
      declarationSha256: createHash('sha256').update(declaration).digest('hex'),
      coverage: {
        aliasCount: aliases.length,
        aliases,
        constructorCount: classes.length,
        classes,
        displays,
        minimalNewNumber: 'makeNumber',
        functionCount: observed.functions.length,
        referenceOwners: owners,
      },
      ...observed,
    };
    fs.writeFileSync(path.join(outputDirectory, 'default-type-consumer.manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify({ outputDirectory, aliasCount: aliases.length, constructorCount: classes.length, defaultSubpaths: observed.defaultSubpaths }, null, 2)}\n`);
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

main();
