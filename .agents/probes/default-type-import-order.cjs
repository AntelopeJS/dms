const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const root = process.argv[2];
const manifest = path.join(root, 'package.json');
const groups = ['address', 'choices', 'files', 'inputs', 'numbers', 'options', 'relations', 'strings'];
const observations = [];
const failures = [];
for (const group of groups) {
  const source = `
    const assert = require('node:assert/strict');
    const load = require('node:module').createRequire(${JSON.stringify(manifest)});
    const direct = load('@antelopejs/interface-dms/base/data-types/default/${group}');
    const { DefaultDataTypes } = load('@antelopejs/interface-dms/base/data-types/default-types');
    const names = Object.keys(DefaultDataTypes);
    assert.equal(names.length, 24, 'Every namespace constructor must be present');
    for (const name of names) {
      const descriptor = Object.getOwnPropertyDescriptor(DefaultDataTypes, name);
      assert.equal(typeof descriptor.value, 'function', name);
      assert.equal(descriptor.writable, true, name);
      assert.equal(descriptor.enumerable, true, name);
      assert.equal(descriptor.configurable, true, name);
    }
    const aliases = Object.keys(direct).filter(name => names.includes(name));
    for (const name of aliases) assert.equal(DefaultDataTypes[name], direct[name], name);
    console.log(JSON.stringify({ group: ${JSON.stringify(group)}, constructors: names.length, aliases }));
  `;
  const child = spawnSync(process.execPath, ['-e', source], { encoding: 'utf8' });
  if (child.status !== 0) failures.push({ group, status: child.status, stderr: child.stderr });
  else observations.push(JSON.parse(child.stdout));
}
assert.deepEqual(failures, [], JSON.stringify(failures));
assert.equal(observations.length, groups.length);
assert.equal(observations.reduce((count, item) => count + item.aliases.length, 0), 19);
process.stdout.write(`${JSON.stringify(observations, null, 2)}\n`);
