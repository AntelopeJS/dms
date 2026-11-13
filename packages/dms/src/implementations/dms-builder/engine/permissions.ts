import { GetPermissions, type PermissionTree } from "@antelopejs/interface-dms";

/** A permission a page can be given, as the access picker lists it. */
export interface PermissionChoice {
  id: string;
  title: string;
  icon?: string;
  /** The branch of the tree it sits under: the module or area it belongs to. */
  group: string;
}

/** How long the DMS is waited on before the list is answered empty. */
const WAIT_MS = 3000;

/**
 * The permission tree the DMS has registered, or undefined when it does not
 * answer in time: an interface nobody implements queues the call for good.
 */
export async function readPermissionTree(): Promise<
  Record<string, PermissionTree> | undefined
> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), WAIT_MS);
    timer.unref?.();
  });
  try {
    return await Promise.race([GetPermissions(), late]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Every permission the DMS has registered, flat, each under the branch it
 * sits in: what a page's access is picked from, rather than an id typed by
 * hand. Empty when the DMS does not answer — a picker with nothing in it, and
 * the id still typable, beats a request that never returns.
 */
export async function listPermissions(): Promise<PermissionChoice[]> {
  const tree = await readPermissionTree();
  const choices: PermissionChoice[] = [];
  const walk = (
    branches: Record<string, PermissionTree>,
    group: string,
  ): void => {
    for (const [key, branch] of Object.entries(branches)) {
      const here = branch.data?.title ?? (group || key);
      if (branch.data) {
        const choice: PermissionChoice = {
          id: branch.data.id,
          title: branch.data.title,
          group: group || here,
        };
        if (branch.data.icon) {
          choice.icon = branch.data.icon;
        }
        choices.push(choice);
      }
      walk(branch.children ?? {}, group || here);
    }
  };
  walk(tree ?? {}, "");
  return choices;
}
