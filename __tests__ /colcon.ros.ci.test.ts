import * as core from "@actions/core";
import { execShellCommand } from "../src/exec.shell.command";
import * as commons from "../src/commons.utils";
import * as dep from "../src/dependencies";

jest.setTimeout(20000); // in milliseconds

describe("execShellCommand test suite", () => {
	it("calls coreGroup", async () => {
		const mockGroup = jest.spyOn(core, "group");
		const result = await execShellCommand(["echo Hello World"]);
		expect(mockGroup).toBeCalled();
		expect(result).toEqual(0);
	});
	it("uses a prefix", async () => {
		const mockGroup = jest.spyOn(core, "group");
		const result = await execShellCommand(["echo", "Hello World"]);
		expect(mockGroup).toBeCalled();
		expect(result).toEqual(0);
	});
	it("ignores return code", async () => {
		const mockGroup = jest.spyOn(core, "group");
		const options = {
			ignoreReturnCode: true,
		};
		const result = execShellCommand(["somebadcommand"], options);
		expect(mockGroup).toBeCalled();
		expect(result).not.toEqual(0);
	});
});

describe("utilities", () => {
	it("should join and filter out non empty elements", () => {
		expect(commons.filterNonEmptyJoin([])).toBe("");
		expect(commons.filterNonEmptyJoin([""])).toBe("");
		expect(commons.filterNonEmptyJoin(["", ""])).toBe("");
		expect(commons.filterNonEmptyJoin(["abc"])).toBe("abc");
		expect(commons.filterNonEmptyJoin(["abc", "def"])).toBe("abc def");
		expect(commons.filterNonEmptyJoin(["abc", "def", ""])).toBe("abc def");
		expect(commons.filterNonEmptyJoin(["", "abc", "", "", "def"])).toBe(
			"abc def"
		);
	});
});

describe("PR-specific repos files", () => {
	it("should not do anything if not a PR", async () => {
		let payload = {};
		expect(dep.getReposFilesOverride(payload)).toEqual([]);
		expect(dep.getReposFilesSupplemental(payload)).toEqual([]);
		payload = { pull_request: {} };
		expect(dep.getReposFilesOverride(payload)).toEqual([]);
		expect(dep.getReposFilesSupplemental(payload)).toEqual([]);
		payload = { pull_request: { body: "" } };
		expect(dep.getReposFilesOverride(payload)).toEqual([]);
		expect(dep.getReposFilesSupplemental(payload)).toEqual([]);
	});

	it("should extract repos files from the PR body", () => {
		const bodyEmpty = `
Description of the changes.
Blah blah.
`;
		let payload = {};
		payload = { pull_request: { body: bodyEmpty } };
		expect(dep.getReposFilesOverride(payload)).toEqual([]);
		expect(dep.getReposFilesSupplemental(payload)).toEqual([]);

		const body = `
Description of the changes.
Blah blah.

action-ros-ci-repos-override:
action-ros-ci-repos-override: https://raw.githubusercontent.com/ros2/ros2/rolling/ros2.repos
action-ros-ci-repos-override : https://some.website.repos
 action-ros-ci-repos-override:  https://gist.github.com/some-user/some-gist.repos
 action-ros-ci-repos-supplemental:https://gist.github.com/some-user/some-other-gist.repos
action-ros-ci-repos-supplemental:  file://path/to/some/file.txt
`;
		payload = { pull_request: { body: body } };
		const expectedOverride = [
			"https://raw.githubusercontent.com/ros2/ros2/rolling/ros2.repos",
			"https://gist.github.com/some-user/some-gist.repos",
		];
		const expectedSupplemental = [
			"https://gist.github.com/some-user/some-other-gist.repos",
			"file://path/to/some/file.txt",
		];
		expect(dep.getReposFilesOverride(payload)).toEqual(
			expect.arrayContaining(expectedOverride)
		);
		expect(dep.getReposFilesSupplemental(payload)).toEqual(
			expect.arrayContaining(expectedSupplemental)
		);
	});
});
