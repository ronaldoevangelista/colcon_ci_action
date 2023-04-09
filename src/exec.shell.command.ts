import * as core from "@actions/core";
import * as im from "@actions/exec/lib/interfaces";
import * as tr from "@actions/exec/lib/toolrunner";

import * as utils from "./commons.utils";

export async function execShellCommand(
  command: string[],
  options?: im.ExecOptions,
  log_message?: string
): Promise<number> {
  command = [utils.filterNonEmptyJoin(command)];

  let toolRunnerCommandLine = "";
  let toolRunnerCommandLineArgs: string[] = [];

  toolRunnerCommandLine = "bash";
  toolRunnerCommandLineArgs = ["-c", ...command];

  const message =
    log_message ||
    `Invoking: ${toolRunnerCommandLine} ${toolRunnerCommandLineArgs}`;

  const runner: tr.ToolRunner = new tr.ToolRunner(
    toolRunnerCommandLine,
    toolRunnerCommandLineArgs,
    options
  );

  if (options && options.silent) {
    return runner.exec();
  }

  return core.group(message, () => {
    return runner.exec();
  });
}
