import * as Y from 'yjs';

const CONTENT_MAP = 'content';
const MAIN_STORY_SUFFIX = '::story::main:word_document.xml';

export type Block = {
  blockId: string;
  text: string;
  mergedIntoBlockId: string | null;
};

type StoryBlockJson = {
  blockId: string;
  text?: string;
  mergedIntoBlockId?: string | null;
};

type StoryJson = {
  blocks: StoryBlockJson[];
  order: Record<string, number>;
};

function toStoryJson(value: unknown): StoryJson {
  if (value instanceof Y.AbstractType) return value.toJSON() as StoryJson;
  return value as StoryJson;
}

function readBlockOrder({ story, blockId }: { story: StoryJson; blockId: string }): number {
  const position = story.order[blockId];
  if (position === undefined) throw new Error(`Block ${blockId} has no position in the main story order.`);
  return position;
}

export function readMainStoryBlocks(document: Y.Doc): Block[] {
  const content = document.getMap(CONTENT_MAP);
  const mainStoryKey = [...content.keys()].find((key) => key.endsWith(MAIN_STORY_SUFFIX));
  if (!mainStoryKey) return [];
  const story = toStoryJson(content.get(mainStoryKey));
  return story.blocks
    .filter((block): block is StoryBlockJson & { text: string } => typeof block.text === 'string')
    .map((block) => ({
      blockId: block.blockId,
      text: block.text,
      mergedIntoBlockId: typeof block.mergedIntoBlockId === 'string' ? block.mergedIntoBlockId : null,
    }))
    .sort((left, right) => readBlockOrder({ story, blockId: left.blockId }) - readBlockOrder({ story, blockId: right.blockId }));
}

export function readMainStoryText(document: Y.Doc): string {
  return readMainStoryBlocks(document)
    .map((block) => block.text)
    .join('');
}
