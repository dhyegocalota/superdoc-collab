import JSZip from 'jszip';
import { OOXML_NAMESPACES } from './ooxml-namespaces';

const WORD_PART_PATTERN = /^word\/.+\.xml$/;
const TAG_PATTERN = /<[A-Za-z_][^>]*>/g;
const ELEMENT_PREFIX_PATTERN = /^<([A-Za-z_][\w.-]*):/;
const QUOTED_VALUE_PATTERN = /"[^"]*"|'[^']*'/g;
const ATTRIBUTE_PREFIX_PATTERN = /\s([A-Za-z_][\w.-]*):[\w.-]+\s*=/g;
const DECLARATION_PATTERN = /\sxmlns:([\w.-]+)\s*=/g;
const ROOT_NAME_PATTERN = /<[A-Za-z_][\w.:-]*/;
const RESERVED_PREFIXES = new Set(['xml', 'xmlns']);

function tagsIn(xml: string): string[] {
  return [...xml.matchAll(TAG_PATTERN)].map((match) => match[0]);
}

function prefixesUsedIn(tags: string[]): Set<string> {
  const prefixes = tags.flatMap((tag) => {
    const elementPrefix = ELEMENT_PREFIX_PATTERN.exec(tag)?.[1];
    const attributePrefixes = [...tag.replace(QUOTED_VALUE_PATTERN, '""').matchAll(ATTRIBUTE_PREFIX_PATTERN)].map((match) => match[1]!);
    return elementPrefix ? [elementPrefix, ...attributePrefixes] : attributePrefixes;
  });
  return new Set(prefixes.filter((prefix) => !RESERVED_PREFIXES.has(prefix)));
}

function prefixesDeclaredIn(xml: string): Set<string> {
  return new Set([...xml.matchAll(DECLARATION_PATTERN)].map((match) => match[1]!));
}

function repairPart({ name, xml }: { name: string; xml: string }): string {
  const tags = tagsIn(xml);
  const rootTag = tags[0];
  if (!rootTag) return xml;
  const declaredOnRoot = prefixesDeclaredIn(rootTag);
  const declaredAnywhere = prefixesDeclaredIn(xml);
  const missing = [...prefixesUsedIn(tags)].filter((prefix) => !declaredOnRoot.has(prefix) && !declaredAnywhere.has(prefix));
  const unknown = missing.filter((prefix) => !(prefix in OOXML_NAMESPACES));
  if (unknown.length > 0) throw new Error(`${name} uses the undeclared prefix ${unknown.join(', ')}, which is not a known OOXML namespace`);
  const declarations = missing.map((prefix) => ` xmlns:${prefix}="${OOXML_NAMESPACES[prefix]}"`).join('');
  return xml.replace(ROOT_NAME_PATTERN, (rootName) => `${rootName}${declarations}`);
}

export async function repairExportedDocx(exported: Blob): Promise<Blob> {
  const zip = await JSZip.loadAsync(exported);
  const names = Object.keys(zip.files).filter((name) => WORD_PART_PATTERN.test(name));
  await Promise.all(
    names.map(async (name) => {
      const xml = await zip.file(name)!.async('string');
      zip.file(name, repairPart({ name, xml }));
    }),
  );
  return zip.generateAsync({ type: 'blob', mimeType: exported.type, compression: 'DEFLATE' });
}
