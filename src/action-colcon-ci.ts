import * as core from "@actions/core";
import * as github from "@actions/github";
import * as im from "@actions/exec/lib/interfaces";
import * as tr from "@actions/exec/lib/toolrunner";
import * as io from "@actions/io";
import * as os from "os";
import * as path from "path";
import * as url from "url";
import fs from "fs";
import retry from "async-retry";

import * as dep from "./dependencies";
import * as utils from "./commons.utils";
import * as runtest from "./colcon.runtest";
import * as runcoverage from "./colcon.runcoverage";

const validROS2Distros: string[] = [
  "dashing",
  "eloquent",
  "foxy",
  "galactic",
  "humble",
  "rolling",
];

const targetROS2DistroInput: string = "target-ros2-distro";

function resolveVcsRepoFileUrl(vcsRepoFileUrl: string): string {
  if (fs.existsSync(vcsRepoFileUrl)) {
    return url.pathToFileURL(path.resolve(vcsRepoFileUrl)).href;
  } else {
    return vcsRepoFileUrl;
  }
}

export async function execShellCommand(
  command: string[],
  options?: im.ExecOptions,
  force_bash: boolean = true,
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

async function installRosdeps(
  packageSelection: string[],
  skipKeys: string[],
  workspaceDir: string,
  options: im.ExecOptions,
  ros2Distro?: string
): Promise<number> {
  const scriptName = "install_rosdeps.sh";
  const scriptPath = path.join(workspaceDir, scriptName);
  const scriptContent = `#!/bin/bash
	set -euxo pipefail
	if [ $# != 1 ]; then
		echo "Specify rosdistro name as single argument to this script"
		exit 1
	fi
	DISTRO=$1
	package_paths=$(colcon list --paths-only ${utils.filterNonEmptyJoin(
    packageSelection
  )})
	rosdep install -r --from-paths $package_paths --ignore-src --skip-keys "rti-connext-dds-5.3.1 ${utils.filterNonEmptyJoin(
    skipKeys
  )}" --rosdistro $DISTRO -y || true`;
  fs.writeFileSync(scriptPath, scriptContent, { mode: 0o766 });

  let exitCode = 0;

  exitCode += await execShellCommand(
    [`./${scriptName} ${ros2Distro}`],
    options
  );

  return exitCode;
}

async function run_throw(): Promise<void> {
  const repo = github.context.repo;
  const workspace = process.env.GITHUB_WORKSPACE as string;

  const colconDefaults = core.getInput("colcon-defaults");
  const colconMixinRepo = core.getInput("colcon-mixin-repository");

  const extraCmakeArgsInput = core.getInput("extra-cmake-args");
  const extraCmakeArgs = extraCmakeArgsInput
    ? ["--cmake-args", extraCmakeArgsInput]
    : [];

  const coverageIgnorePatternInput = core.getInput("coverage-ignore-pattern");
  const coverageIgnorePattern = coverageIgnorePatternInput
    ? ["--filter", coverageIgnorePatternInput]
    : [];

  const colconExtraArgsInput = core.getInput("colcon-extra-args");
  const colconExtraArgs = colconExtraArgsInput ? [colconExtraArgsInput] : [];

  const importToken = core.getInput("import-token");

  const packageNameInput = core.getInput("package-name");
  const packageNames = packageNameInput
    ? packageNameInput.split(RegExp("\\s"))
    : undefined;
  const buildPackageSelection = packageNames
    ? ["--packages-up-to", ...packageNames]
    : [];
  const testPackageSelection = packageNames
    ? ["--packages-select", ...packageNames]
    : [];

  const rosdepSkipKeysInput = core.getInput("rosdep-skip-keys");
  const rosdepSkipKeys = rosdepSkipKeysInput
    ? rosdepSkipKeysInput.split(RegExp("\\s"))
    : undefined;
  const rosdepSkipKeysSelection = rosdepSkipKeys ? [...rosdepSkipKeys] : [];

  const rosWorkspaceName = "ros_ws";
  core.setOutput("ros-workspace-directory-name", rosWorkspaceName);
  const rosWorkspaceDir = path.join(workspace, rosWorkspaceName);
  const targetRos2Distro = core.getInput(targetROS2DistroInput);
  const vcsRepoFileUrlListAsString = core.getInput("vcs-repo-file-url") || "";

  let vcsRepoFileUrlList = vcsRepoFileUrlListAsString.split(RegExp("\\s"));

  const skipTests = core.getInput("skip-tests") === "true";
  const skipCoverage = core.getInput("skip-coverage") === "true";
  const vcsReposOverride = dep.getReposFilesOverride(github.context.payload);
  const vcsReposSupplemental = dep.getReposFilesSupplemental(
    github.context.payload
  );

  await core.group(
    "Repos files: override" + (vcsReposOverride.length === 0 ? " - none" : ""),
    () => {
      for (const vcsRepos of vcsReposOverride) {
        core.info("\t" + vcsRepos);
      }
      return Promise.resolve();
    }
  );
  if (vcsReposOverride.length > 0) {
    vcsRepoFileUrlList = vcsReposOverride;
  }
  await core.group(
    "Repos files: supplemental" +
      (vcsReposSupplemental.length === 0 ? " - none" : ""),
    () => {
      for (const vcsRepos of vcsReposSupplemental) {
        core.info("\t" + vcsRepos);
      }
      return Promise.resolve();
    }
  );
  vcsRepoFileUrlList = vcsRepoFileUrlList.concat(vcsReposSupplemental);

  const vcsRepoFileUrlListNonEmpty = vcsRepoFileUrlList.filter((x) => x != "");
  await retry(
    async () => {
      await execShellCommand(["rosdep update --include-eol-distros"]);
    },
    {
      retries: 3,
    }
  );

  await io.rmRF(path.join(os.homedir(), ".colcon"));
  let colconDefaultsFile = "";
  if (colconDefaults.length > 0) {
    if (!utils.isValidJson(colconDefaults)) {
      core.setFailed(
        `colcon-defaults value is not a valid JSON string:\n${colconDefaults}`
      );
      return;
    }
    colconDefaultsFile = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), "colcon-defaults-")),
      "defaults.yaml"
    );
    fs.writeFileSync(colconDefaultsFile, colconDefaults);
  }

  await io.rmRF(rosWorkspaceDir);
  await io.mkdirP(rosWorkspaceDir + "/src");

  const options: im.ExecOptions = {
    cwd: rosWorkspaceDir,
    env: {
      ...process.env,
      ROS_VERSION: "2",
      ROS_PYTHON_VERSION: "3",
    },
  };
  if (colconDefaultsFile !== "") {
    options.env = {
      ...options.env,
      COLCON_DEFAULTS_FILE: colconDefaultsFile,
    };
  }

  options.env = {
    ...options.env,
    DEBIAN_FRONTEND: "noninteractive",
  };

  if (importToken !== "") {
    await execShellCommand(
      [
        `/usr/bin/git config --local --unset-all http.https://github.com/.extraheader || true`,
      ],
      options
    );
    await execShellCommand(
      [
        String.raw`/usr/bin/git submodule foreach --recursive git config --local --name-only --get-regexp 'http\.https\:\/\/github\.com\/\.extraheader'` +
          ` && git config --local --unset-all 'http.https://github.com/.extraheader' || true`,
      ],
      options
    );
    // Use a global insteadof entry because local configs aren't observed by git clone
    await execShellCommand(
      [
        `/usr/bin/git config --global url.https://x-access-token:${importToken}@github.com.insteadof 'https://github.com'`,
      ],
      options
    );
    // same as last three comands but for ssh urls
    await execShellCommand(
      [
        `/usr/bin/git config --local --unset-all git@github.com:.extraheader || true`,
      ],
      options
    );
    await execShellCommand(
      [
        String.raw`/usr/bin/git submodule foreach --recursive git config --local --name-only --get-regexp 'git@github\.com:.extraheader'` +
          ` && git config --local --unset-all 'git@github.com:.extraheader' || true`,
      ],
      options
    );
    // Use a global insteadof entry because local configs aren't observed by git clone (ssh)
    await execShellCommand(
      [
        `/usr/bin/git config --global url.https://x-access-token:${importToken}@github.com/.insteadof 'git@github.com:'`,
      ],
      options
    );
    if (core.isDebug()) {
      await execShellCommand(
        [`/usr/bin/git config --list --show-origin || true`],
        options
      );
    }
  }

  // Make sure to delete root .colcon directory if it exists
  // This is because, for some reason, using Docker, commands might get run as root
  await execShellCommand(
    [`rm -rf ${path.join(path.sep, "root", ".colcon")} || true`],
    { ...options, silent: true }
  );

  for (const vcsRepoFileUrl of vcsRepoFileUrlListNonEmpty) {
    const resolvedUrl = resolveVcsRepoFileUrl(vcsRepoFileUrl);
    await execShellCommand(
      [`vcs import --force --recursive src/ --input ${resolvedUrl}`],
      options
    );
  }

  await execShellCommand(
    [
      `vcs diff -s --repos ${rosWorkspaceDir} | cut -d ' ' -f 1 | grep "${repo["repo"]}$"` +
        ` | xargs rm -rf`,
    ],
    undefined
  );

  let repoFullName = process.env.GITHUB_REPOSITORY as string;
  if (github.context.payload.pull_request) {
    repoFullName = github.context.payload.pull_request.head.repo.full_name;
  }
  const headRef = process.env.GITHUB_HEAD_REF as string;
  const commitRef = headRef || github.context.sha;
  const repoFilePath = path.join(rosWorkspaceDir, "package.repo");

  const randomStringPrefix = Math.random().toString(36).substring(2, 15);
  const repoFileContent = `repositories:
  ${randomStringPrefix}/${repo["repo"]}:
    type: git
    url: 'https://github.com/${repoFullName}.git'
    version: '${commitRef}'`;
  fs.writeFileSync(repoFilePath, repoFileContent);

  await execShellCommand(
    ["vcs import --force --recursive src/ < package.repo"],
    options
  );

  await execShellCommand(["vcs log -l1 src/"], options);
  await execShellCommand(["sudo apt-get update"]);
  await installRosdeps(
    buildPackageSelection,
    rosdepSkipKeysSelection,
    rosWorkspaceDir,
    options,
    targetRos2Distro
  );

  if (colconDefaults.includes(`"mixin"`) && colconMixinRepo !== "") {
    await execShellCommand(
      [`colcon`, `mixin`, `add`, `default`, `${colconMixinRepo}`],
      options,
      false
    );
    await execShellCommand(
      [`colcon`, `mixin`, `update`, `default`],
      options,
      false
    );
  }

  core.addPath(path.join(rosWorkspaceDir, "install", "bin"));

  let colconCommandPrefix: string[] = [];

  const ros2SetupPath = `/opt/ros/${targetRos2Distro}/setup.sh`;
  if (fs.existsSync(ros2SetupPath)) {
    colconCommandPrefix = [
      ...colconCommandPrefix,
      `source ${ros2SetupPath}`,
      `&&`,
    ];
  }

  let colconBuildCmd = [
    `colcon`,
    `build`,
    `--symlink-install`,
    ...buildPackageSelection,
    ...colconExtraArgs,
    ...extraCmakeArgs,
    `--event-handlers=console_cohesion+`,
  ];

  await execShellCommand(
    [...colconCommandPrefix, ...colconBuildCmd],
    options,
    false
  );

  if (!skipTests) {
    await runtest.runTests(
      colconCommandPrefix,
      options,
      testPackageSelection,
      colconExtraArgs
    );
  } else {
    core.info("Skipping tests");
  }

  if (!skipCoverage) {
    await runcoverage.runCoverage(
      colconCommandPrefix,
      options,
      testPackageSelection,
      colconExtraArgs,
      coverageIgnorePattern,
      rosWorkspaceDir
    );
  } else {
    core.info("Skipping coverage");
  }

  if (importToken !== "") {
    await execShellCommand(
      [
        `/usr/bin/git config --global --unset-all url.https://x-access-token:${importToken}@github.com.insteadof`,
      ],
      options
    );
  }
}

async function run(): Promise<void> {
  try {
    await run_throw();
  } catch (error) {
    let errorMessage = "Unknown error";
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    core.setFailed(errorMessage);
  }
}

run();
