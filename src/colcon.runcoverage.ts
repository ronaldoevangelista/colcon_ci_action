import * as core from "@actions/core";
import * as im from "@actions/exec/lib/interfaces";
import * as tr from "@actions/exec/lib/toolrunner";

import * as cmd from "./exec.shell.command";

export async function runCoverage(
  colconCommandPrefix: string[],
  options: im.ExecOptions,
  testPackageSelection: string[],
  colconExtraArgs: string[],
  coverageIgnorePattern: string[],
  workspaceDir: string
): Promise<void> {
  const lcovDir = `${workspaceDir}/locv`;
  const outputDir = [`mkdir`, `-p`, lcovDir];

  await cmd.execShellCommand([...colconCommandPrefix, ...outputDir], {
    ...options,
    ignoreReturnCode: true,
  });

  const colconLcovInitialCmd = [
    `lcov`,
    `--directory`,
    workspaceDir,
    `--zerocounters`,
  ];
  await cmd.execShellCommand(
    [...colconCommandPrefix, ...colconLcovInitialCmd],
    {
      ...options,
      ignoreReturnCode: true,
    }
  );

  const colconLcovCaptureInitialCmd = [
    `lcov`,
    `--no-external`,
    `--capture`,
    `--initial`,
    `--directory`,
    workspaceDir,
    `--output-file`,
    `${lcovDir}/initial_coverage.info`,
  ];
  await cmd.execShellCommand(
    [...colconCommandPrefix, ...colconLcovCaptureInitialCmd],
    {
      ...options,
      ignoreReturnCode: true,
    }
  );

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

  const colconLcovCaptureTestlCmd = [
    `lcov`,
    `--no-external`,
    `--capture`,
    `--directory`,
    workspaceDir,
    `--output-file`,
    `${lcovDir}/test_coverage.info`,
  ];
  await cmd.execShellCommand(
    [...colconCommandPrefix, ...colconLcovCaptureTestlCmd],
    {
      ...options,
      ignoreReturnCode: true,
    }
  );

  const colconLcovAddTracefileCmd = [
    `lcov`,
    `--add-tracefile`,
    `${lcovDir}/initial_coverage.info`,
    `--add-tracefile`,
    `${lcovDir}/test_coverage.info`,
    `--output-file`,
    `${lcovDir}/merge_coverage.info`,
  ];
  await cmd.execShellCommand(
    [...colconCommandPrefix, ...colconLcovAddTracefileCmd],
    {
      ...options,
      ignoreReturnCode: true,
    }
  );

  const colconLcovRemoveCmd = [
    `lcov`,
    `--remove`,
    `${lcovDir}/merge_coverage.info`,
    `*/CMakeCCompilerId.c`,
    `*/CMakeCXXCompilerId.cpp`,
    `--output-file`,
    `${lcovDir}/report_coverage.info`,
  ];

  await cmd.execShellCommand([...colconCommandPrefix, ...colconLcovRemoveCmd], {
    ...options,
    ignoreReturnCode: true,
  });

  const colconLcovlistCmd = [
    `lcov`,
    `--list`,
    `${lcovDir}/report_coverage.info`,
  ];
  await cmd.execShellCommand([...colconCommandPrefix, ...colconLcovlistCmd], {
    ...options,
    ignoreReturnCode: true,
  });
}
