// Markdown with a YAML frontmatter block, the format of every human-edited file
// in a story. Parsing and writing both go through Bun.YAML, so there is no YAML
// dependency and a parse → serialize → parse cycle returns the same data.

export type Frontmatter = Record<string, unknown>;

export type Document = { data: Frontmatter; body: string };

export class FrontmatterError extends Error {}

const block = /^---\r?\n([\s\S]*?)\r?\n?---[ \t]*(?:\r?\n|$)([\s\S]*)$/;

export function parseFrontmatter(text: string): Document {
  const match = block.exec(text);
  if (!match) return { data: {}, body: text.trim() };
  return { data: parseYaml(match[1] ?? ""), body: (match[2] ?? "").trim() };
}

export function serializeFrontmatter(data: Frontmatter, body: string): string {
  const content = body.trim();
  if (Object.keys(data).length === 0) return content ? `${content}\n` : "";
  // Bun.YAML.stringify leaves a space after keys that open a block. Multi-line
  // strings are always emitted quoted, so stripping line-end spaces is safe.
  const yaml = (Bun.YAML.stringify(data, null, 2) ?? "").replace(/[ \t]+$/gm, "");
  return `---\n${yaml}\n---\n${content ? `\n${content}\n` : ""}`;
}

export async function readFrontmatterFile(file: string): Promise<Document> {
  return parseFrontmatter(await Bun.file(file).text());
}

export async function writeFrontmatterFile(file: string, data: Frontmatter, body: string) {
  await Bun.write(file, serializeFrontmatter(data, body));
}

function parseYaml(yaml: string): Frontmatter {
  let parsed: unknown;
  try {
    parsed = Bun.YAML.parse(yaml);
  } catch (error) {
    throw new FrontmatterError(`invalid YAML frontmatter: ${(error as Error).message}`);
  }
  if (parsed === null || parsed === undefined) return {};
  if (typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new FrontmatterError("frontmatter must be a mapping of keys to values");
  }
  return { ...parsed };
}
