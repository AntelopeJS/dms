import { z } from "zod";
import { FormComponents } from "../form-schema";
import { DataType, RegisterDataType } from "./core";
// The cycle is what registers the default data types: they declare
// themselves through decorators, and this barrel is the only value
// path that evaluates them. Breaking it left the registry empty and
// every column serialised without a type, silently. Safe because
// neither side dereferences the other while it evaluates.
// oxlint-disable-next-line import/no-cycle
import { DefaultDataCompareTypes } from "./compare-types";

@RegisterDataType("status")
export class StatusType extends DataType {
  constructor(
    public readonly options: {
      onlineLabel?: string;
      offlineLabel?: string;
      onlineColor?: string;
      offlineColor?: string;
    } = {
      onlineLabel: "$common.status.online",
      offlineLabel: "$common.status.offline",
      onlineColor: "primary",
      offlineColor: "neutral",
    },
  ) {
    super(
      [DefaultDataCompareTypes.Is, DefaultDataCompareTypes.IsNot],
      DefaultDataCompareTypes.Is,
      options as Record<string, unknown>,
    );
  }

  protected defaultInputComponent() {
    const component = FormComponents.InputCheckbox();
    component.options = this.options;
    return component;
  }

  getValidation() {
    return z.boolean();
  }
}
