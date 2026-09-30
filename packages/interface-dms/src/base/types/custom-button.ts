import type { ButtonPermission, ComponentFilterContext } from "../../component";
import type { MaybePromise } from "../../types";
import type { ActionTarget, ActionTargetSerialized } from "./action-target";
import type { ButtonVariant } from "./button";

export type ButtonColor =
  | "primary"
  | "secondary"
  | "success"
  | "error"
  | "warning"
  | "info"
  | "neutral";

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
  /**
   * Gate the button behind a permission. A string names one of the owning
   * table's actions (e.g. `"add"`); an `Action` references any component's
   * action (e.g. another table's `add`). The button is stripped from the
   * serialized options when the caller lacks the permission.
   */
  permission?: ButtonPermission;
  /**
   * Disables the button for a request it answers with a reason. A button the
   * caller lacks the permission for is stripped before this runs.
   */
  availability?: CustomButtonAvailability;
}

export interface CustomButtonSerialized extends Omit<
  CustomButton,
  "target" | "permission" | "availability"
> {
  target: ActionTargetSerialized;
  /** Set when the button's `availability` refused this request. */
  disabled?: boolean;
  /** The reason `availability` gave, shown next to the disabled button. */
  disabledReason?: string;
}
