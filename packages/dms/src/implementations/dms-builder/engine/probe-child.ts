import { z } from "zod";
import { loadModuleFrom } from "./module-loader";
import {
  OUTCOME_MARK,
  PROBE_REQUEST,
  type ProbeOutcome,
  ProbeRequest,
} from "./probe-protocol";

/** What Node throws when a package, or a file of it, is not installed. */
const NotInstalled = z.object({
  code: z.literal("MODULE_NOT_FOUND"),
  message: z.string(),
});

const ProbeModule = z.object({
  probe: z
    .function()
    .args(
      z.object({
        url: z.string(),
        timeoutMs: z.number(),
        signal: z.instanceof(AbortSignal),
      }),
    )
    .returns(z.promise(z.unknown())),
});

type LoadedProbe = z.infer<typeof ProbeModule>["probe"];

const ThrownMessage = z
  .instanceof(Error)
  .pipe(z.object({ message: z.string() }))
  .transform(({ message }) => message)
  .catch("The driver's probe ended with an error that carries no message.");

/** The driver's `probe`, from the first base that installs it, or `undefined` when none does. */
function installedProbe(
  specifier: string,
  bases: readonly string[],
): LoadedProbe | undefined {
  for (const base of bases) {
    try {
      const loaded = ProbeModule.safeParse(loadModuleFrom(base, specifier));
      return loaded.success ? loaded.data.probe : undefined;
    } catch (error) {
      const failure = NotInstalled.safeParse(error);
      if (
        !failure.success ||
        !failure.data.message.includes(`'${specifier}'`)
      ) {
        throw error;
      }
    }
  }
  return undefined;
}

/** Writes what the probe came to as the one line the check reads, on a line of its own whatever the driver printed before. */
function reply(outcome: ProbeOutcome): void {
  process.stdout.write(`\n${OUTCOME_MARK}${JSON.stringify(outcome)}\n`);
}

async function answer(): Promise<void> {
  const request = ProbeRequest.safeParse(
    JSON.parse(process.env[PROBE_REQUEST] ?? "null"),
  );
  delete process.env[PROBE_REQUEST];
  if (!request.success) {
    reply({
      kind: "failed",
      message: "The check sent the probe a request it could not read.",
    });
    return;
  }
  const { specifier, bases, url, timeoutMs } = request.data;
  const probe = installedProbe(specifier, bases);
  if (!probe) {
    reply({ kind: "missing" });
    return;
  }
  const answered = await probe({
    url,
    timeoutMs,
    signal: new AbortController().signal,
  });
  reply({ kind: "answer", answer: answered });
}

answer().catch((error: unknown) => {
  reply({ kind: "failed", message: ThrownMessage.parse(error) });
});
