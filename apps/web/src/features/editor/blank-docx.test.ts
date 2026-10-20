import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

const BLANK_DOCX_FILE = new URL('../../../public/blank.docx', import.meta.url);
const NAMESPACE_PREFIXES = ['w', 'r', 'wp', 'a', 'pic', 'mc', 'v', 'o', 'm', 'w14', 'w15'];

test.each(NAMESPACE_PREFIXES)(
  'the blank document a joiner opens declares xmlns:%s, so an export that holds an image stays well-formed',
  (prefix) => {
    const archive = readFileSync(BLANK_DOCX_FILE).toString('latin1');
    expect(archive).toContain(` xmlns:${prefix}="`);
  },
);
