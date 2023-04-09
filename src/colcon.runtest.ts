import * as core from "@actions/core";
import * as im from "@actions/exec/lib/interfaces";
import * as tr from "@actions/exec/lib/toolrunner";

import * as cmd from "./exec.shell.command";

export async function runTests(
  colconCommandPrefix: string[],
  options: im.ExecOptions,
  testPackageSelection: string[],
  colconExtraArgs: string[]
): Promise<void> {
  let colconTestCmd = [
    `colcon`,
    `test`,
    `--event-handlers=console_cohesion+`,
    ...testPackageSelection,
    ...colconExtraArgs,
  ];

  await cmd.execShellCommand(
    [...colconCommandPrefix, ...colconTestCmd],
    options
  );

  const colconTestResultCmd = ["colcon", "test-result"];
  const colconTestResultAllCmd = [...colconTestResultCmd, "--all"];
  const colconTestResultVerboseCmd = [...colconTestResultCmd, "--verbose"];

  await cmd.execShellCommand(
    [...colconCommandPrefix, ...colconTestResultAllCmd],
    {
      ...options,
      ignoreReturnCode: true,
    }
  );
  await cmd.execShellCommand(
    [...colconCommandPrefix, ...colconTestResultVerboseCmd],
    options
  );
}
