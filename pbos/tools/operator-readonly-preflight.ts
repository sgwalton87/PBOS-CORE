import { homedir } from "node:os";
import { join } from "node:path";
import { inspectExistingOperatorRuntime } from "../production-runtime/operator-readonly-preflight";

const stateHome = process.env.PBOS_STATE_HOME ?? join(homedir(), ".pbos");
const report = inspectExistingOperatorRuntime(stateHome);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (report.status === "BLOCKED") process.exitCode = 2;
