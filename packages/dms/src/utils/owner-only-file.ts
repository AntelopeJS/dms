import { execFile } from "node:child_process";
import { chmod, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { platform } from "node:os";
import { basename, dirname, join, win32 } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const OWNER_ONLY_MODE = 0o600;
const POWERSHELL_TIMEOUT_MS = 30_000;
const TARGET_ENV = "DMS_OWNER_ONLY_FILE";

const SET_OWNER_ONLY_DACL = [
  "$ErrorActionPreference = 'Stop'",
  "$user = [System.Security.Principal.WindowsIdentity]::GetCurrent().User",
  "$acl = [System.Security.AccessControl.FileSecurity]::new()",
  "$acl.SetAccessRuleProtection($true, $false)",
  "$acl.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new($user, 'FullControl', 'Allow'))",
  `[System.IO.File]::SetAccessControl($env:${TARGET_ENV}, $acl)`,
].join("; ");

const SET_OWNER_ONLY_DIRECTORY_DACL = [
  "$ErrorActionPreference = 'Stop'",
  "$user = [System.Security.Principal.WindowsIdentity]::GetCurrent().User",
  "$acl = [System.Security.AccessControl.DirectorySecurity]::new()",
  "$acl.SetAccessRuleProtection($true, $false)",
  "$acl.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new($user, 'FullControl', 'ContainerInherit, ObjectInherit', 'None', 'Allow'))",
  `[System.IO.Directory]::SetAccessControl($env:${TARGET_ENV}, $acl)`,
].join("; ");

/**
 * On Windows, replaces the DACL of `target` with a protected one whose only
 * entry grants the process token's user full control, through `script`. That
 * drops the inherited entries and the explicit ones the process's default DACL
 * gives a new file, including `SYSTEM` and `Administrators`, needs no
 * privilege beyond owning the target, and parses no output. PowerShell is
 * called by its System32 path, gets the path through the environment, never in
 * its command text, and is stopped after a timeout. The scripts call .NET
 * only, no cmdlet, so a module path inherited from PowerShell 7 cannot break
 * them. Does nothing elsewhere: POSIX modes do the job there.
 */
async function applyOwnerOnlyDacl(
  target: string,
  script: string,
): Promise<void> {
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
    ["-NoProfile", "-NonInteractive", "-Command", script],
    {
      env: { ...process.env, [TARGET_ENV]: target },
      timeout: POWERSHELL_TIMEOUT_MS,
      windowsHide: true,
    },
  );
}

/**
 * Writes a secret to `filePath` so that only the current user can read it:
 * mode `0o600` on POSIX, a protected DACL with that user alone on Windows.
 *
 * The file is staged in a directory this call creates beside the target and
 * restricts, inheritably, before any file exists in it, so the staged file is
 * born owner-only and no other account can hold a handle opened before the
 * restriction. The staged file gets its own DACL, the secret is written, and
 * the file is renamed over the target. The directory holding the target is
 * never re-ACLed. On any failure, including a PowerShell timeout, the staging
 * directory is removed, the target is left as it was, and the call rejects.
 */
export async function writeOwnerOnlyFile(
  filePath: string,
  content: string,
): Promise<void> {
  const staging = await mkdtemp(
    join(dirname(filePath), `.${basename(filePath)}-`),
  );
  try {
    await applyOwnerOnlyDacl(staging, SET_OWNER_ONLY_DIRECTORY_DACL);
    const temp = join(staging, basename(filePath));
    await writeFile(temp, "", { mode: OWNER_ONLY_MODE });
    await chmod(temp, OWNER_ONLY_MODE);
    await applyOwnerOnlyDacl(temp, SET_OWNER_ONLY_DACL);
    await writeFile(temp, content);
    await rename(temp, filePath);
  } finally {
    await rm(staging, { recursive: true, force: true }).catch(() => undefined);
  }
}
