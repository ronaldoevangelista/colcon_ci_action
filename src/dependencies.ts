import { WebhookPayload } from "@actions/github/lib/interfaces";

const REGEX_REPOS_FILES_OVERRIDE = /action-ros-ci-repos-override:[ ]*([\S]+)/g;
const REGEX_REPOS_FILES_SUPPLEMENTAL =
  /action-ros-ci-repos-supplemental:[ ]*([\S]+)/g;

function extractCaptures(content: string, regex: RegExp): string[][] {
  const captures: string[][] = [];
  let matches;
  while ((matches = regex.exec(content)) !== null) {
    const capture = matches.slice(1);
    if (capture.length > 0) {
      captures.push(capture);
    }
  }
  return captures;
}

function extractPrBody(contextPayload: WebhookPayload): string | undefined {
  const prPayload = contextPayload.pull_request;
  if (!prPayload) {
    return undefined;
  }
  return prPayload.body;
}

export function getReposFilesOverride(
  contextPayload: WebhookPayload
): string[] {
  const prBody = extractPrBody(contextPayload);
  if (!prBody) {
    return [];
  }

  return extractCaptures(prBody, REGEX_REPOS_FILES_OVERRIDE).map((capture) => {
    return capture[0];
  });
}

export function getReposFilesSupplemental(
  contextPayload: WebhookPayload
): string[] {
  const prBody = extractPrBody(contextPayload);
  if (!prBody) {
    return [];
  }

  return extractCaptures(prBody, REGEX_REPOS_FILES_SUPPLEMENTAL).map(
    (capture) => {
      return capture[0];
    }
  );
}
