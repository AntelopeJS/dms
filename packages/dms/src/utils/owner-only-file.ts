import { execFile } from "node:child_process";
import { chmod, rename, rm, writeFile } from "node:fs/promises";
import { platform } from "node:os";
import { win32 } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const OWNER_ONLY_MODE = 0o600;
const TARGET_ENV = "DMS_OWNER_ONLY_FILE";

const SET_OWNER_ONLY_DACL = [
  "$ErrorActionPreference = 'Stop'",
  "$user = [System.Security.Principal.WindowsIdentity]::GetCurrent().User",
  "$acl = [System.Security.AccessControl.FileSecurity]::new()",
  "$acl.SetAccessRuleProtection($true, $false)",
  "$acl.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new($user, 'FullControl', 'Allow'))",
  `[System.IO.File]::SetAccessControl($env:${TARGET_ENV}, $acl)`,
].join("; ");

/**
 * Restricts a file to the current user. POSIX gets mode `0o600`. Windows
 * ignores modes, so there Windows PowerShell replaces the file's DACL with a
 * protected one whose only entry grants the process token's user full
 * control. That drops the inherited entries and the explicit ones the
 * process's default DACL gives a new file, needs no privilege beyond owning
 * the file, and parses no output. PowerShell is called by its System32 path
 * and gets the file path through the environment, never in its command text.
 * The script calls .NET only, no cmdlet, so a module path inherited from
 * PowerShell 7 cannot break it.
 */
async function restrictToOwner(filePath: string): Promise<void> {
  await chmod(filePath, OWNER_ONLY_MODE);
  if (platform() !== "win32") return;
  const systemRoot = process.env.SystemRoot ?? "C:\\Windows";
  const powershell = win32.join(
    systemRoot,
    "System32",
    "WindowsPowerShell",
    "v1.0",
    "powershell.exe",
  );
  await execFileAsync(
    powershell,
    ["-NoProfile", "-NonInteractive", "-Command", SET_OWNER_ONLY_DACL],
    { env: { ...process.env, [TARGET_ENV]: filePath } },
  );
}

/**
 * Writes a secret to `filePath` through a temporary file that is restricted to
 * the current user before the secret is written to it and before it is renamed
 * into place, so no reader sees the secret under a wider mode or ACL. The
 * temporary file is removed on failure.
 */
export async function writeOwnerOnlyFile(
  filePath: string,
  content: string,
): Promise<void> {
  const temp = `${filePath}.${process.pid}.tmp`;
  try {
    await writeFile(temp, "", { mode: OWNER_ONLY_MODE });
    await restrictToOwner(temp);
    await writeFile(temp, content);
    await rename(temp, filePath);
  } catch (error) {
    await rm(temp, { force: true }).catch(() => undefined);
    throw error;
  }
}
