import type { JsonValue } from "../../../../dms-core/app/types/json";
import { isString } from "../../../../dms-core/app/utils/type-check";
import { isObjectValue } from "./json";
import { isWithinPointer } from "./mockupSpec";

/** Event of the mockup stream carrying `{ viewers, locks }`: who is on the mockup and the blocks held. */
export const MOCKUP_PRESENCE_EVENT = "presence";

/** A browser session on the mockup, by the name its user goes by. */
export interface MockupViewer {
  viewer: string;
  name: string;
}

/** The block a viewer is editing: where it is in the spec now. */
export interface MockupLock extends MockupViewer {
  page: string;
  path: string;
}

/** Who is on a mockup and which blocks they hold. */
export interface MockupPresence {
  viewers: MockupViewer[];
  locks: MockupLock[];
}

/** A mockup nobody is known to be on. */
export const NO_PRESENCE: MockupPresence = { viewers: [], locks: [] };

const UUID_BYTES = 16;
const VERSION_BYTE = 6;
const VARIANT_BYTE = 8;
const VERSION_BITS = 0x40;
const VARIANT_BITS = 0x80;
const VERSION_MASK = 0x0f;
const VARIANT_MASK = 0x3f;
const HEX_RADIX = 16;
const UUID_GROUPS = [8, 4, 4, 4, 12] as const;

/**
 * A fresh random version 4 UUID, which the backend takes as a viewer id.
 * `crypto.randomUUID` exists on secure origins alone, and a mockup is
 * often opened from a development server's plain-HTTP address.
 */
export function newViewerId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(UUID_BYTES));
  bytes[VERSION_BYTE] = (bytes[VERSION_BYTE] & VERSION_MASK) | VERSION_BITS;
  bytes[VARIANT_BYTE] = (bytes[VARIANT_BYTE] & VARIANT_MASK) | VARIANT_BITS;
  const hex = Array.from(bytes, (byte) =>
    byte.toString(HEX_RADIX).padStart(2, "0"),
  ).join("");
  let start = 0;
  return UUID_GROUPS.map((length) => {
    const group = hex.slice(start, start + length);
    start += length;
    return group;
  }).join("-");
}

function isViewer(
  value: JsonValue | undefined,
): value is JsonValue & MockupViewer {
  return isObjectValue(value) && isString(value.viewer) && isString(value.name);
}

function isLock(value: JsonValue | undefined): value is JsonValue & MockupLock {
  return (
    isViewer(value) &&
    isObjectValue(value) &&
    isString(value.page) &&
    isString(value.path)
  );
}

/** The presence a stream event carries, or undefined when the data is not one. */
export function parseMockupPresence(
  value: JsonValue | undefined,
): MockupPresence | undefined {
  if (!isObjectValue(value)) return undefined;
  const { viewers, locks } = value;
  return Array.isArray(viewers) &&
    viewers.every(isViewer) &&
    Array.isArray(locks) &&
    locks.every(isLock)
    ? { viewers, locks }
    : undefined;
}

/**
 * The lock of another viewer than `viewer` that keeps the block at `pointer`
 * from being edited: one on that block, on a block it sits in, or on a block
 * inside it, as the backend refuses to give two viewers.
 */
export function blockerOf(
  presence: MockupPresence,
  viewer: string,
  pointer: string,
): MockupLock | undefined {
  return presence.locks.find(
    (lock) =>
      lock.viewer !== viewer &&
      (isWithinPointer(lock.path, pointer) ||
        isWithinPointer(pointer, lock.path)),
  );
}

/** The name of whoever holds each block other than `viewer`'s own, by the block's pointer. */
export function holdersOf(
  presence: MockupPresence,
  viewer: string,
): Map<string, string> {
  return new Map(
    presence.locks
      .filter((lock) => lock.viewer !== viewer)
      .map((lock) => [lock.path, lock.name]),
  );
}
