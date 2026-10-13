import { useActionConfirm } from "../../build/composables/confirm/useActionConfirm";
import type { ConfirmFromOptions } from "./types";

/**
 * Opens the confirmation dialog a route words (a `ConfirmDialogSerialized`,
 * see `serializeConfirmDialog`), as a declarative action's
 * `confirm: { from }` does: the URL is read, its texts resolved, then the
 * standard confirm dialog shown. A failed read is a toast and resolves
 * `false`.
 *
 * @returns `confirmFrom(url, options)`, resolving `true` when the user
 *   confirmed — never for a `blocked` dialog, which only explains
 */
export function useConfirmFrom() {
  const { confirmAction } = useActionConfirm();

  function confirmFrom(
    from: string,
    options: ConfirmFromOptions = {},
  ): Promise<boolean> {
    return confirmAction(
      { from },
      {
        row: options.params,
        fallback: options.fallback,
        run: options.onConfirm,
      },
    );
  }

  return { confirmFrom };
}
