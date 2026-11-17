import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { BasicDataModel } from "@antelopejs/interface-database-decorators";
import { SetupToken, setupTokenTableName } from "../tables";

const SETUP_TOKEN_ID = "owner";
const GENERATED_TOKEN_BYTES = 32;

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

/** Compares two secrets in constant time, whatever their lengths. */
function sameSecret(left: string, right: string): boolean {
  return timingSafeEqual(digest(left), digest(right));
}

export class SetupTokenModel extends BasicDataModel(
  SetupToken,
  setupTokenTableName,
) {
  private async current(): Promise<SetupToken | undefined> {
    const row = await this.table.get(SETUP_TOKEN_ID).run();
    return row ? SetupTokenModel.fromDatabase(row) : undefined;
  }

  private async write(token: string, conflict: "replace" | undefined) {
    await this.table
      .insert(
        { _id: SETUP_TOKEN_ID, token, createdAt: new Date() },
        conflict ? { conflict } : undefined,
      )
      .run();
  }

  /**
   * Makes sure the instance has a setup token, so that every replica that
   * starts without an owner accepts the same value.
   *
   * @param configured The token the deployment configured; it replaces a stored one
   * @returns The token the instance accepts
   */
  async ensure(configured?: string): Promise<string> {
    if (configured) {
      await this.write(configured, "replace");
      return configured;
    }
    const existing = await this.current();
    if (existing) return existing.token;

    const generated = randomBytes(GENERATED_TOKEN_BYTES).toString("base64url");
    try {
      await this.write(generated, undefined);
      return generated;
    } catch (error) {
      const winner = await this.current();
      if (winner) return winner.token;
      throw error;
    }
  }

  /**
   * Spends the token: the one caller whose database delete removes the row
   * gets it, so concurrent registrations cannot both go on.
   *
   * @param candidate The token the caller sent
   * @returns The spent token, or undefined when the caller's is wrong or already spent
   */
  async claim(candidate: string | undefined): Promise<string | undefined> {
    if (!candidate) return undefined;
    const stored = await this.current();
    if (!stored || !sameSecret(stored.token, candidate)) return undefined;
    const deleted = await this.table.get(SETUP_TOKEN_ID).delete().run();
    return deleted === 1 ? stored.token : undefined;
  }

  /** Puts a spent token back after the registration that spent it failed. */
  async restore(token: string): Promise<void> {
    await this.write(token, "replace");
  }

  /** Drops the token, once the instance has an owner. */
  async clear(): Promise<void> {
    await this.table.get(SETUP_TOKEN_ID).delete().run();
  }
}
