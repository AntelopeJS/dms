import { describeFailure } from "./failure.mjs";
import { runService } from "./services.mjs";

const [name = "", ...args] = process.argv.slice(2);

try {
  await runService(name, args);
} catch (error) {
  process.stderr.write(`dms e2e ${name}: ${describeFailure(error)}\n`);
  process.exitCode = 1;
}
