import type {
  DeviceType,
  ParsedUserAgent,
} from "@antelopejs/interface-dms/auth";
import { UAParser } from "ua-parser-js";

export type {
  DeviceType,
  ParsedUserAgent,
} from "@antelopejs/interface-dms/auth";

const DEVICE_TYPES: Record<string, DeviceType> = {
  mobile: "mobile",
  tablet: "tablet",
};

export function parseUserAgent(userAgent: string): ParsedUserAgent {
  const parsed = new UAParser(userAgent);
  const browser = parsed.getBrowser();
  const os = parsed.getOS();
  const device = parsed.getDevice();

  return {
    browserName: browser.name ?? "",
    browserVersion: browser.version ?? "",
    osName: os.name ?? "",
    osVersion: os.version ?? "",
    deviceType: DEVICE_TYPES[device.type ?? ""] ?? "desktop",
  };
}
