import type { ImportOverrideInput } from "@antelopejs/interface-dms-builder";
import { Node } from "ts-morph";
import { CATALOG_INTERFACE, DATABASE_INTERFACE } from "./interface-ids";
import { hides } from "./literal-overrides";
import { propertyKey } from "./modules";
import {
  type ConfigDraft,
  IMPORT_OVERRIDES,
  MODULES,
  objectAt,
  overrideOf,
  propertyNamed,
  stringOf,
} from "./project-config";

/** Every module of the configuration, by id, with its entry as written, whatever its form. */
export function writtenModules(
  draft: ConfigDraft,
): [string, Node | undefined][] {
  return (objectAt(draft, [MODULES])?.getProperties() ?? []).flatMap(
    (property): [string, Node | undefined][] => {
      if (Node.isPropertyAssignment(property)) {
        return [
          [propertyKey(property.getNameNode()), property.getInitializer()],
        ];
      }
      return Node.isShorthandPropertyAssignment(property)
        ? [[property.getName(), property.getNameNode()]]
        : [];
    },
  );
}

/**
 * The interfaces through which a database driver or a tables module can be a source, the modules
 * a connection's removal takes: an override of another interface whose source is not a literal is
 * not one of their readers.
 */
export const DATABASE_SOURCE_INTERFACES: ReadonlySet<string> = new Set([
  DATABASE_INTERFACE,
  CATALOG_INTERFACE,
]);

/**
 * Whether an override whose source cannot be read may name the module: always, unless the module
 * is a source only `through` some interfaces and the override's interface is read and another.
 */
function unreadSourceMayName(
  interfaceId: string | undefined,
  through: ReadonlySet<string> | undefined,
): boolean {
  return (
    through === undefined ||
    interfaceId === undefined ||
    through.has(interfaceId)
  );
}

interface SourceScope {
  ignored: (override: ImportOverrideInput) => boolean;
  through?: ReadonlySet<string>;
}

function overridesMayName(
  overrides: Node,
  source: string,
  { ignored, through }: SourceScope,
): boolean {
  if (Node.isObjectLiteralExpression(overrides)) {
    return overrides.getProperties().some((property) => {
      if (!Node.isPropertyAssignment(property)) {
        return true;
      }
      const named = stringOf(property.getInitializer());
      return named === undefined
        ? unreadSourceMayName(
            Node.isComputedPropertyName(property.getNameNode())
              ? undefined
              : propertyKey(property.getNameNode()),
            through,
          )
        : named === source;
    });
  }
  if (!Node.isArrayLiteralExpression(overrides)) {
    return true;
  }
  return overrides.getElements().some((element) => {
    if (
      !Node.isObjectLiteralExpression(element) ||
      !element.getProperties().every(Node.isPropertyAssignment)
    ) {
      return true;
    }
    const override = overrideOf(element);
    const written = propertyNamed(element, "source") !== undefined;
    if (written && override.source === undefined) {
      return unreadSourceMayName(override.interface || undefined, through);
    }
    return override.source === source && !ignored(override);
  });
}

/**
 * Whether a module entry names `source` in its `importOverrides`, or may: an entry or an override
 * written other than as a plain literal counts, since the builder cannot tell what it names. A
 * module written as a version names none. `ignored` leaves out overrides that do not count;
 * `through` names the only interfaces the module can be a source through, when they are known.
 */
export function mayNameSource(
  entry: Node | undefined,
  source: string,
  scope: Partial<SourceScope> = {},
): boolean {
  if (entry === undefined || stringOf(entry) !== undefined) {
    return false;
  }
  if (
    !Node.isObjectLiteralExpression(entry) ||
    hides(entry, IMPORT_OVERRIDES)
  ) {
    return true;
  }
  const overrides = propertyNamed(entry, IMPORT_OVERRIDES)?.getInitializer();
  return (
    overrides !== undefined &&
    overridesMayName(overrides, source, {
      ignored: scope.ignored ?? (() => false),
      through: scope.through,
    })
  );
}
