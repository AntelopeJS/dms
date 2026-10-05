import type { ButtonPermission, ComponentFilterContext } from "../../component";
import type { MaybePromise } from "../../types";
import type { ActionTarget, ActionTargetSerialized } from "./action-target";
import type { ActionConfirm, ActionConfirmSerialized } from "./confirm-dialog";
import type { ButtonVariant } from "./button";
import type { Tone } from "./tone";

/** The `color` of a button or an action: one of the semantic tones. */
export type ButtonColor = Tone;

/** Where a table's button is drawn: its toolbar, or its page's header. */
export type ButtonPlacement = "toolbar" | "header";

/** Why a button cannot be pressed right now. */
export interface CustomButtonUnavailability {
  /**
   * Shown next to the disabled button: what blocks it, and how to lift the
   * block when the user can. A `$`-prefixed value resolves as an i18n key.
   */
  reason: string;
}

/**
 * Decides, per request, whether a button can be pressed. Runs server-side
 * while the page layout is filtered, so the button reaches the client already
 * disabled. Returning `undefined` leaves it enabled.
 *
 * It only shapes the UI: whatever the button triggers must still refuse the
 * operation on its own.
 */
export type CustomButtonAvailability = (
  context: ComponentFilterContext,
) => MaybePromise<CustomButtonUnavailability | undefined>;

export interface CustomButton {
  /**
   * Names the button so a quick action can press it (`type: "button"`); the
   * action then inherits the button's `permission`. Unique within its table.
   */
  id?: string;
  label: string;
  icon?: string;
  variant?: ButtonVariant;
  color?: ButtonColor;
  target: ActionTarget;
  /** Asked before the button's target runs: a fixed dialog, or `{ from }`. */
  confirm?: ActionConfirm;
  /**
   * Gate the button behind a permission: one of the owning table's actions by
   * name (e.g. `"add"`) — in a page header (`DefaultLayout({ headerActions
   * })`), an action of the page, relative to its permission id — or an
   * `Action` of any component (e.g. another table's `add`). The button is
   * stripped from the served options when the caller lacks the permission.
   */
  permission?: ButtonPermission;
  /** Absolute permission id the button requires; wins over `permission`. */
  permissionId?: string;
  /**
   * Disables the button for a request it answers with a reason. A button the
   * caller lacks the permission for is stripped before this runs.
   */
  availability?: CustomButtonAvailability;
  /**
   * Where the button is drawn: in the table's toolbar (the default), or in
   * the header of the page carrying the table, which the server adds it to —
   * the table still runs it. Either way a quick action can press it by `id`.
   */
  placement?: ButtonPlacement;
}

export interface CustomButtonSerialized extends Omit<
  CustomButton,
  "target" | "permission" | "permissionId" | "availability" | "confirm"
> {
  target: ActionTargetSerialized;
  confirm?: ActionConfirmSerialized;
  /** Set when the button's `availability` refused this request. */
  disabled?: boolean;
  /** The reason `availability` gave, shown next to the disabled button. */
  disabledReason?: string;
}
