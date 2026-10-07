/** @internal */
export type DeviceType = "mobile" | "tablet" | "desktop";

/** @internal */
export interface ParsedUserAgent {
  browserName: string;
  browserVersion: string;
  osName: string;
  osVersion: string;
  deviceType: DeviceType;
}
