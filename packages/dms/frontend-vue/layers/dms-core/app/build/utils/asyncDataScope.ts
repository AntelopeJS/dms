/** The part of the session the data scope follows. */
export interface ScopedSession {
  accountId?: string;
  activeTenantId?: string;
}

const HASH_SEED_LOW = 0xdeadbeef;
const HASH_SEED_HIGH = 0x41c6ce57;
const HASH_MULTIPLIER_LOW = 2_654_435_761;
const HASH_MULTIPLIER_HIGH = 1_597_334_677;
const HASH_MIX_LOW = 2_246_822_507;
const HASH_MIX_HIGH = 3_266_489_909;
const HIGH_WORD = 2 ** 32;
const HIGH_BITS_MASK = 2_097_151;
const RADIX = 36;

/**
 * A 53-bit digest of `text` (cyrb53): the same in a server render and in the
 * browser, and synchronous, so the scope is set before the page renders.
 * Not a secret: it only keeps the identifiers out of the page.
 */
function digest(text: string): string {
  let low = HASH_SEED_LOW;
  let high = HASH_SEED_HIGH;
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    low = Math.imul(low ^ code, HASH_MULTIPLIER_LOW);
    high = Math.imul(high ^ code, HASH_MULTIPLIER_HIGH);
  }
  low = Math.imul(low ^ (low >>> 16), HASH_MIX_LOW);
  low ^= Math.imul(high ^ (high >>> 13), HASH_MIX_HIGH);
  high = Math.imul(high ^ (high >>> 16), HASH_MIX_LOW);
  high ^= Math.imul(low ^ (low >>> 13), HASH_MIX_HIGH);
  return (HIGH_WORD * (HIGH_BITS_MASK & high) + (low >>> 0)).toString(RADIX);
}

/**
 * The scope the async data of a session is kept under: a digest of its
 * account and workspace, or none when signed out. The same key read by
 * another account, or in another workspace, is another entry.
 */
export function asyncDataScopeOf(
  session: ScopedSession | null | undefined,
): string | undefined {
  if (!session?.accountId) return undefined;
  return digest(`${session.accountId}\n${session.activeTenantId ?? ""}`);
}
