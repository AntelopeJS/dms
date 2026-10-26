import type { ComponentInfoSerialized } from "../../component";
import { z } from "zod";
import { FormComponents } from "../form-schema";
import { DataType, RegisterDataType } from "./core";
// oxlint-disable-next-line import/no-cycle -- StatusType uses the registered built-in comparator classes when instances are constructed.
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
    const component: ComponentInfoSerialized = FormComponents.InputCheckbox();
    component.options = this.options;
    return component;
  }

  getValidation() {
    return z.boolean();
  }
}
