export function paragraphText(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  if (Array.isArray(node)) return node.map(paragraphText).join("");
  const record = node as Record<string, unknown>;
  if (record.kind === "run") return (record.run as { text: string }).text;
  if (record.kind === "lineBreak") return "\n";
  if (record.kind === "tab") return "\t";
  if (record.kind === "field")
    return (record.field as { resultText?: string }).resultText ?? "";
  return Object.values(record).map(paragraphText).join("");
}
