import type * as Y from 'yjs';

const MAIN_STORY_KEY = 'room::story::main:word_document.xml';

export function writeStory({ document, texts }: { document: Y.Doc; texts: string[] }): void {
  const blockIds = texts.map((_, index) => `b${index}`);
  const blocks = texts.map((text, index) => ({ blockId: blockIds[index], text }));
  document.getMap('content').set(MAIN_STORY_KEY, { blocks, order: Object.fromEntries(blockIds.map((blockId, index) => [blockId, index])) });
}

export function commitBootstrap(document: Y.Doc): void {
  document.getMap('meta').set('bootstrapState', 'committed');
}
