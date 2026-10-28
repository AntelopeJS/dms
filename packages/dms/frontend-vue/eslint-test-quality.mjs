import antiSlop from "@antelopejs/tooling-configs/oxc/anti-slop";
import guardrails from "@antelopejs/tooling-configs/oxc/guardrails";

const rules = {
  "no-fs-read-in-tests": guardrails.rules["no-fs-read-in-tests"],
  "require-assertion": guardrails.rules["require-assertion"],
  "no-constant-value-assertion":
    guardrails.rules["no-constant-value-assertion"],
  "no-typeof-function-only-test":
    guardrails.rules["no-typeof-function-only-test"],
  "no-module-mocking": antiSlop.rules["no-module-mocking"],
};

export default {
  rules: Object.fromEntries(
    Object.entries(rules).map(([name, rule]) => [
      name,
      {
        meta: rule.meta,
        create(context) {
          const sourceCode = context.sourceCode;
          const compatibleSourceCode = Object.create(sourceCode, {
            isGlobalReference: {
              value(node) {
                let scope = sourceCode.getScope(node);
                while (scope !== null) {
                  const variable = scope.set.get(node.name);
                  if (variable !== undefined) return variable.defs.length === 0;
                  scope = scope.upper;
                }
                return true;
              },
            },
          });
          const visitors = rule.createOnce(
            Object.create(context, {
              sourceCode: { value: compatibleSourceCode },
            }),
          );
          return {
            ...visitors,
            Program(node) {
              const pending = [node];
              while (pending.length > 0) {
                const current = pending.pop();
                if (current.start !== undefined) continue;
                [current.start, current.end] = current.range;
                for (const key of sourceCode.visitorKeys[current.type] ?? []) {
                  const children = current[key];
                  if (Array.isArray(children))
                    pending.push(...children.filter(Boolean));
                  else if (children) pending.push(children);
                }
              }
              visitors.Program?.(node);
            },
          };
        },
      },
    ]),
  ),
};
