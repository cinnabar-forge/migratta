import type { JsonSchema } from "./types.js";

export function wrapColumn(value: string | number): string | number {
  return typeof value === "string" ? `"${value}"` : value;
}

export function wrapValue(value: string | number): string | number {
  return typeof value === "string" ? `'${value}'` : value;
}

export function jsonSchemaToTypeScript(schema: JsonSchema, indent = 0): string {
  if (schema.$ref) {
    const ref = schema.$ref.split("/").pop();
    if (ref) {
      // Convert to PascalCase like schema names
      const pascalRef = ref
        .split("-")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join("");
      return `${pascalRef}Schema`;
    }
  }

  // Handle const values (before types and enums)
  if (schema.const !== undefined) {
    return typeof schema.const === "string"
      ? `"${schema.const}"`
      : String(schema.const);
  }

  // Handle enums (before basic types, since enums can have types too)
  if (schema.enum) {
    return schema.enum
      .map((v: unknown) => (typeof v === "string" ? `"${v}"` : String(v)))
      .join(" | ");
  }

  // Handle basic types
  switch (schema.type) {
    case "string":
      if (schema.format === "email") return "string";
      if (schema.format === "date-time") return "string";
      return "string";
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    case "null":
      return "null";
    case "integer":
      return "number";
  }

  // Handle objects
  if (schema.type === "object" && schema.properties) {
    const props = Object.entries(schema.properties)
      .map(([key, propSchema]) => {
        const optional = !schema.required?.includes(key) ? "?" : "";
        const type = jsonSchemaToTypeScript(
          propSchema as JsonSchema,
          indent + 2,
        );
        const indentStr = " ".repeat(indent + 2);
        return `${indentStr}${key}${optional}: ${type};`;
      })
      .join("\n");

    const indentStr = " ".repeat(indent);
    return `{\n${props}\n${indentStr}}`;
  }

  // Handle arrays
  if (schema.type === "array" && schema.items) {
    const itemType = jsonSchemaToTypeScript(schema.items as JsonSchema);
    return `${itemType}[]`;
  }

  // Handle unions
  if (schema.anyOf) {
    return schema.anyOf
      .map((s) => jsonSchemaToTypeScript(s as JsonSchema))
      .join(" | ");
  }

  if (schema.oneOf) {
    return schema.oneOf
      .map((s) => jsonSchemaToTypeScript(s as JsonSchema))
      .join(" | ");
  }

  if (schema.allOf) {
    // Simplified - just return the first type for allOf
    return jsonSchemaToTypeScript(schema.allOf[0]);
  }

  // Default fallback
  return "unknown";
}
