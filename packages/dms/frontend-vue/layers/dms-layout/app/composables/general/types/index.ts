export type InterfaceScale = "small" | "normal" | "large";

export interface ScaleOption {
  value: InterfaceScale;
  label: string;
  hint: string;
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
