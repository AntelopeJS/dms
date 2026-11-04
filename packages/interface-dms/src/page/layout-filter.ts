import type { WatchAction } from "../watch-actions";
import type {
  ChildSerialized,
  ComponentFilterContext,
  ComponentInfoSerialized,
} from "../component";
import { HasPermission } from "../permissions";
import { isNull, isObject, isString } from "../utils/internal/type-check";
import type { ComponentTreeNode } from "./component-tree";

/**
 * Every component of the page, keyed by the permission id of its position —
 * what the registration established by walking the component tree.
 */
export type ComponentNodeMap = Map<string, ComponentTreeNode>;

async function filterComponentInfo(
  comp: ComponentInfoSerialized,
  permissionId: string,
  permissions: Set<string>,
  componentMap: ComponentNodeMap,
  context: ComponentFilterContext,
): Promise<ComponentInfoSerialized> {
  const filtered = { ...comp };

  if (filtered.children && filtered.children.length > 0) {
    filtered.children = await filterAccessibleChildren(
      filtered.children,
      permissionId,
      permissions,
      componentMap,
      context,
    );
  }

  const component = componentMap.get(permissionId)?.component;
  if (component?.onFilterCallback && filtered.options) {
    filtered.options = await component.onFilterCallback(
      permissions,
      filtered.options,
      permissionId,
      context,
    );
  }

  filtered.options = await filterRequiredPermissionWatches(
    filtered.options,
    permissions,
  );

  return filtered;
}

type GatedWatch = Pick<WatchAction, "requirePermission">;

const isList = (value: unknown): value is unknown[] => Array.isArray(value);

const isGatedWatch = (value: unknown): value is GatedWatch =>
  isObject(value) &&
  !isNull(value) &&
  (!("requirePermission" in value) ||
    value.requirePermission === undefined ||
    isString(value.requirePermission));

const isPlainObject = (
  value: ComponentInfoSerialized["options"],
): value is Record<string, ComponentInfoSerialized["options"]> =>
  !!value &&
  typeof value === "object" &&
  (Object.getPrototypeOf(value) === Object.prototype ||
    Object.getPrototypeOf(value) === null);

/**
 * The watch actions the caller may run: one gated by `requirePermission` is
 * kept only when the caller holds that permission as everywhere else (an
 * owner's `*` and the permission's ancestors included).
 *
 * Checked on the component's own options and on every component embedded in
 * them: a host serializes what it opens (a table view's forms in a drawer or a
 * modal, a dialog's content) into its options with `serializeSync()`, so those
 * are not nodes of the page's tree. `watchActions` is the transport key the
 * builder alone fills (it strips one a caller passes), so any object holding
 * it is a component's options. A value with no gated watch keeps its identity.
 * A watch the walker cannot read (not an object, or a `requirePermission` that
 * is no string) is withheld, since no permission could grant it.
 */
async function filterRequiredPermissionWatches(
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- Walks the serialized options of whichever component it meets, each typed by its declaring module and able to hold a DefaultValue Date, and narrows each node with Array.isArray or isPlainObject before reading it.
  value: unknown,
  permissions: Set<string>,
  // oxlint-disable-next-line anti-slop/no-unknown-returns -- Answers that options tree unchanged or with the gated watches removed, so it is as open as the options of whichever component it walked.
): Promise<unknown> {
  if (Array.isArray(value)) {
    const items = await Promise.all(
      value.map((item) => filterRequiredPermissionWatches(item, permissions)),
    );
    return items.every((item, index) => item === value[index]) ? value : items;
  }
  if (!isPlainObject(value)) return value;
  const entries = await Promise.all(
    Object.entries(value).map(
      async ([key, item]) =>
        [
          key,
          await filterRequiredPermissionWatches(item, permissions),
        ] as const,
    ),
  );
  const changed = entries.some(([key, item]) => item !== value[key]);
  const next = changed ? Object.fromEntries(entries) : value;
  const watches = next.watchActions;
  if (!isList(watches)) return next;
  const granted = await Promise.all(
    watches.map(
      async (watch) =>
        isGatedWatch(watch) &&
        (!watch.requirePermission ||
          (await HasPermission(permissions, watch.requirePermission))),
    ),
  );
  if (granted.every(Boolean)) return next;
  return {
    ...next,
    watchActions: watches.filter((_, index) => granted[index]),
  };
}

/**
 * Whether a child of an already-granted component is served.
 *
 * Every child reached during registration has its own permission. A withheld
 * child shares its id with an action of its parent, so no answer about that id
 * describes it.
 *
 * A child the registration never walked — for example, one hanging off a
 * promised `ComponentInfo` — has no node here and fails closed even if a stale
 * role still carries the derived id.
 */
function childIsAccessible(
  permissions: Set<string>,
  permissionId: string,
  node: ComponentTreeNode | undefined,
): Promise<boolean> {
  if (!node || node.access === "withheld") return Promise.resolve(false);
  return HasPermission(permissions, permissionId);
}

async function filterAccessibleChildren(
  children: ChildSerialized[],
  permissionId: string,
  permissions: Set<string>,
  componentMap: ComponentNodeMap,
  context: ComponentFilterContext,
): Promise<ChildSerialized[]> {
  const childrenWithPermissions = await Promise.all(
    children.map(async (child: ChildSerialized) => {
      const childPermissionId = `${permissionId}.${child.id}`;
      return {
        child,
        hasPermission: await childIsAccessible(
          permissions,
          childPermissionId,
          componentMap.get(childPermissionId),
        ),
      };
    }),
  );

  return Promise.all(
    childrenWithPermissions
      .filter(({ hasPermission }) => hasPermission)
      .map(async ({ child }) => {
        const { id, component, ...additionalProps } = child;
        return {
          id,
          component: await filterComponentInfo(
            component,
            `${permissionId}.${id}`,
            permissions,
            componentMap,
            context,
          ),
          ...additionalProps,
        };
      }),
  );
}

export async function filterComponents(
  components: Record<string, ComponentInfoSerialized>,
  basePath: string,
  permissions: Set<string>,
  componentMap: ComponentNodeMap,
  context: ComponentFilterContext,
): Promise<Record<string, ComponentInfoSerialized>> {
  const filtered: Record<string, ComponentInfoSerialized> = {};

  for (const [key, comp] of Object.entries(components)) {
    const permissionId = `${basePath}.${key}`;
    if (await HasPermission(permissions, permissionId)) {
      filtered[key] = await filterComponentInfo(
        comp,
        permissionId,
        permissions,
        componentMap,
        context,
      );
    }
  }

  return filtered;
}
