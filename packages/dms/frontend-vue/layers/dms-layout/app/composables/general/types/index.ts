export type InterfaceScale = "small" | "normal" | "large";

export interface ScaleOption {
  value: InterfaceScale;
  label: string;
  hint: string;
}

export type ColorModePreference = "light" | "dark" | "system";

export interface ColorModeOption {
  value: ColorModePreference;
  label: string;
}

export interface SystemStateMeta {
  title: string;
  description: string;
}

export interface SystemState {
  _id?: string;
  has_onboarded: boolean;
  meta: SystemStateMeta;
  createdAt?: Date;
  updatedAt?: Date;
}
