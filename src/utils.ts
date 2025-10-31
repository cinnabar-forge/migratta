export function wrapValue(value: string | number): string | number {
  return typeof value === "string" ? `'${value}'` : value;
}
