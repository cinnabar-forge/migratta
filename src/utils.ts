export function wrapColumn(value: string | number): string | number {
  return typeof value === "string" ? `"${value}"` : value;
}

export function wrapValue(value: string | number): string | number {
  return typeof value === "string" ? `'${value}'` : value;
}
