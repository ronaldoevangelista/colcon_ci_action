import fs from "fs";
import * as url from "url";
import * as path from "path";

export function filterNonEmptyJoin(values: string[]): string {
  return values.filter((v) => v.length > 0).join(" ");
}

export function isValidJson(str: string): boolean {
  try {
    JSON.parse(str);
  } catch (e) {
    return false;
  }
  return true;
}

export function resolveVcsRepoFileUrl(vcsRepoFileUrl: string): string {
  if (fs.existsSync(vcsRepoFileUrl)) {
    return url.pathToFileURL(path.resolve(vcsRepoFileUrl)).href;
  } else {
    return vcsRepoFileUrl;
  }
}
