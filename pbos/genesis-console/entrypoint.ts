import { runPbosCli } from "./pbos-cli";

runPbosCli().then(exitCode => {
    process.exitCode = exitCode;
}).catch(error => {
    process.stderr.write(`PBOS error: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
});
