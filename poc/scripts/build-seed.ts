import { writeFile } from 'node:fs/promises';
import { buildSeedDocx } from '../lib/seed-docx';

const paragraphs = ['ana', 'bruno', 'caio', 'dani'].map((author) => ({ text: `Paragraph owned by ${author}.`, trackedChanges: [] }));
await writeFile(new URL('../client/public/seed.docx', import.meta.url), await buildSeedDocx(paragraphs));
