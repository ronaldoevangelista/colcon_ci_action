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
