const XML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const XML_SPECIAL_CHARACTERS = /[&<>"]/g;

export function escapeXml(text: string): string {
  return text.replace(XML_SPECIAL_CHARACTERS, (character) => XML_ESCAPES[character]!);
}
