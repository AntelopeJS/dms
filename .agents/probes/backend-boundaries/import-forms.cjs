const { join, root, source, specifier } = require("./context.cjs");

const packageProbe = join(source, "utils", `__package_probe_${process.pid}.ts`);
const interfacePath = specifier(
  packageProbe,
  join(root, "packages/interface-dms/dist/page.ts"),
);
const relativeImports = [
  `import * as page from ${JSON.stringify(interfacePath)};`,
  `export * from ${JSON.stringify(interfacePath)};`,
  `import page = require(${JSON.stringify(interfacePath)});`,
  `const page = require(${JSON.stringify(interfacePath)});`,
  `void import(${JSON.stringify(interfacePath)});`,
  `type Page = typeof import(${JSON.stringify(interfacePath)});`,
  `const page = require(\`${interfacePath}\`);`,
  `void import(\`${interfacePath}\`);`,
  ...[JSON.stringify(interfacePath), `\`${interfacePath}\``].flatMap(
    (literal) =>
      [
        `(${literal})`,
        `${literal} satisfies string`,
        `${literal} as string`,
        `<string>${literal}`,
        `${literal}!`,
        `((${literal} as string) satisfies string)!`,
        `(<string>(${literal} satisfies string))!`,
      ].flatMap((argument) => [
        `void require(${argument});`,
        `void import(${argument});`,
      ]),
  ),
];

function computedArguments(template, sum) {
  return [template, sum].flatMap((expression) => [
    `(${expression})`,
    `(${expression}) satisfies string`,
    `(${expression}) as string`,
    `<string>(${expression})`,
    `(${expression})!`,
    `(((<string>(${expression})) as string) satisfies string)!`,
  ]);
}

const adversarialImports = ["src", "dist"].flatMap((folder) => {
  const target = `../../../interface-dms/${folder}/page`;
  const literal = JSON.stringify(target);
  const template = `\`\${"../../../interface-dms"}/${folder}/page\``;
  const sum = `"../../../interface-dms" + "/${folder}/page"`;
  return [
    ...[
      template,
      sum,
      `(${literal}, ${literal})`,
      `true ? ${literal} : ${literal}`,
      `[${literal}][0]`,
      ...computedArguments(template, sum),
    ].flatMap((argument) => [
      `void require(${argument});`,
      `void import(${argument});`,
    ]),
    `void (require)(${literal});`,
    `void (require as NodeRequire)(${literal});`,
    `void require.call(null, ${literal});`,
    `void require.apply(null, [${literal}]);`,
    `const other = ${literal}; void require(other);`,
  ];
});

module.exports = {
  adversarialImports,
  interfacePath,
  packageProbe,
  relativeImports,
};
