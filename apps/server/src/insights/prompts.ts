import type { Block } from '@superdoc-history/history';
import { MAX_TOPICS, MIN_TOPICS, SUMMARY_SENTENCE_MAX_LENGTH, TOPIC_NAME_MAX_LENGTH } from '@superdoc-history/history';

export const PROMPT_BLOCK_MAX_CHARACTERS = 500;
export const PROMPT_MAX_BLOCKS = 400;
export const PROMPT_TOPIC_MAX_CHARACTERS = 2000;

export type PromptEdit = { author: string; inserted: string; deleted: string };
export type PromptTopic = { id: string; name: string; edits: PromptEdit[] };

const XML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const XML_SPECIAL_CHARACTERS = /[&<>"]/g;

export function escapeXml(text: string): string {
  return text.replace(XML_SPECIAL_CHARACTERS, (character) => XML_ESCAPES[character]!);
}

export const TOPICS_SYSTEM_PROMPT = `<role>You name the topics of one document.</role>
<task>Group the blocks into ${MIN_TOPICS} to ${MAX_TOPICS} topics; a short document may have fewer. Give each topic a name of at most ${TOPIC_NAME_MAX_LENGTH} characters and the ids of its blocks.</task>
<rules>
- Use only block ids from the input.
- A block belongs to one topic.
- Names are one to four words in the document's language, without numbers.
</rules>
<examples>
<block id="b1">Budget: the plan costs 10.</block><block id="b2">Hiring: two engineers.</block> → {"topics":[{"name":"Budget","blockIds":["b1"]},{"name":"Hiring","blockIds":["b2"]}]}
</examples>
<output>JSON: {topics: [{name, blockIds}]}</output>`;

export const SUMMARIES_SYSTEM_PROMPT = `<role>You summarize what changed in each topic of one document.</role>
<task>For every topic id, write one sentence of at most ${SUMMARY_SENTENCE_MAX_LENGTH} characters about what the edits changed.</task>
<rules>
- Use only topic ids from the input.
- Name people by the names given in the edits.
- Write in the language of the edited text.
</rules>
<examples>
<topic id="t1" name="Budget"><edit author="Maria">+raised the cost to 12 −10</edit></topic> → {"summaries":[{"topicId":"t1","sentence":"Maria raised the cost from 10 to 12."}]}
</examples>
<output>JSON: {summaries: [{topicId, sentence}]}</output>`;

export function topicsPrompt(blocks: Block[]): string {
  return `<blocks>\n${blocks.slice(0, PROMPT_MAX_BLOCKS).map((block) => `<block id="${escapeXml(block.blockId)}">${escapeXml(block.text.slice(0, PROMPT_BLOCK_MAX_CHARACTERS))}</block>`).join('\n')}\n</blocks>`;
}

function renderEdit(edit: PromptEdit): string {
  return `<edit author="${escapeXml(edit.author)}">+${escapeXml(edit.inserted)} −${escapeXml(edit.deleted)}</edit>`;
}

function withinBudget(rendered: string[]): string[] {
  const kept = rendered.reduce<{ lines: string[]; used: number }>(
    (accumulated, line) => {
      if (accumulated.used + line.length > PROMPT_TOPIC_MAX_CHARACTERS) return accumulated;
      return { lines: [...accumulated.lines, line], used: accumulated.used + line.length };
    },
    { lines: [], used: 0 },
  );
  return kept.lines;
}

export function summariesPrompt(topics: PromptTopic[]): string {
  const rendered = topics.map((topic) => `<topic id="${escapeXml(topic.id)}" name="${escapeXml(topic.name)}">\n${withinBudget(topic.edits.map(renderEdit)).join('\n')}\n</topic>`);
  return `<topics>\n${rendered.join('\n')}\n</topics>`;
}
