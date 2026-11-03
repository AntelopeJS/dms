import { unlockrequest } from "@antelopejs/interface-database-decorators";
import { User, UserModel } from "@antelopejs/interface-dms/auth/db";

/**
 * Writes a password again when its stored hash is outdated. Call it only once
 * the password is proven, the one moment the plaintext is known. The write
 * applies only while the row still holds the hash that was tested, so it cannot
 * bring back a password changed in the meantime. It touches nothing else: the
 * account keeps its sessions and its dates.
 *
 * @param userModel Model the account is written through
 * @param user The account, as read before the password was tested
 * @param password The proven password
 */
export async function upgradePasswordHash(
  userModel: UserModel,
  user: User,
  password: string,
): Promise<void> {
  if (!user.isHashOutdated("password")) return;
  const testedHash = user.password;
  user.password = password;
  const { _internal } = UserModel.toDatabase(user);
  const storedHashes: ReturnType<typeof UserModel.toDatabase> = { _internal };
  await userModel.table
    .getAll(user.email, "email")
    .filter((row) =>
      row
        .key("_id")
        .eq(user._id)
        .and(unlockrequest(User, row, "password", []).eq(testedHash)),
    )
    .update(storedHashes)
    .run();
}
