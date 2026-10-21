import type { Page } from '@playwright/test';

const LINE_SELECTOR = '.superdoc-line';
const PAGE_SELECTOR = '.superdoc-page';
const SETTLE_TIMEOUT_MS = 60_000;
const QUIET_PERIOD_MS = 1500;
const EDITOR_TEST_ID = 'document-editor';
const SCROLL_HEIGHT_QUIET_MS = 3000;
const SCROLL_HEIGHT_ATTEMPTS = 40;
const LONG_TASK_ENTRY_TYPE = 'longtask';
const TYPING_STATE_KEY = '__typingLatency';

type TypingState = {
  startedAt: number;
  expected: string | null;
  settled: Promise<number>;
  resolve: (elapsedMs: number) => void;
  longTaskDurations: number[];
};

export const TYPING_PROBE_SCRIPT = `(() => {
  const state = { startedAt: 0, expected: null, settled: null, resolve: null, longTaskDurations: [], checkQueued: false };
  window.${TYPING_STATE_KEY} = state;
  new PerformanceObserver((list) => list.getEntries().forEach((entry) => state.longTaskDurations.push(entry.duration))).observe({ entryTypes: ['${LONG_TASK_ENTRY_TYPE}'] });
  addEventListener('keydown', () => { state.startedAt = performance.now(); }, true);
  function caretPage() {
    const anchor = document.getSelection() && document.getSelection().anchorNode;
    const element = anchor && (anchor.nodeType === Node.ELEMENT_NODE ? anchor : anchor.parentElement);
    return (element && element.closest('${PAGE_SELECTOR}')) || document.querySelector('${PAGE_SELECTOR}') || document;
  }
  function isTyped() {
    return Array.from(caretPage().querySelectorAll('${LINE_SELECTOR}')).some((line) => (line.textContent || '').startsWith(state.expected));
  }
  function check() {
    state.checkQueued = false;
    if (state.expected === null || state.startedAt === 0 || !isTyped()) return;
    const elapsedMs = performance.now() - state.startedAt;
    state.expected = null;
    state.resolve(elapsedMs);
  }
  new MutationObserver(() => {
    if (state.expected === null || state.checkQueued) return;
    state.checkQueued = true;
    requestAnimationFrame(check);
  }).observe(document, { subtree: true, childList: true, characterData: true });
})();`;

async function armProbe({ page, expected }: { page: Page; expected: string }): Promise<void> {
  await page.evaluate(
    ({ key, text }) => {
      const state = (window as unknown as Record<string, TypingState>)[key]!;
      state.startedAt = 0;
      state.expected = text;
      state.settled = new Promise<number>((resolve) => (state.resolve = resolve));
    },
    { key: TYPING_STATE_KEY, text: expected },
  );
}

async function awaitSettled({ page }: { page: Page }): Promise<number> {
  return page.evaluate(
    ({ key, timeoutMs }) => {
      const state = (window as unknown as Record<string, TypingState>)[key]!;
      const timeout = new Promise<number>((_, reject) =>
        setTimeout(() => reject(new Error('the typed text never reached the page')), timeoutMs),
      );
      return Promise.race([state.settled, timeout]);
    },
    { key: TYPING_STATE_KEY, timeoutMs: SETTLE_TIMEOUT_MS },
  );
}

async function clearLongTasks({ page }: { page: Page }): Promise<void> {
  await page.evaluate((key) => ((window as unknown as Record<string, TypingState>)[key]!.longTaskDurations.length = 0), TYPING_STATE_KEY);
}

async function longTasksAfterQuiet({ page }: { page: Page }): Promise<number[]> {
  await page.evaluate((quietMs) => new Promise((done) => setTimeout(done, quietMs)), QUIET_PERIOD_MS);
  return page.evaluate((key) => [...(window as unknown as Record<string, TypingState>)[key]!.longTaskDurations], TYPING_STATE_KEY);
}

export async function typeAndMeasure({
  page,
  letters,
}: {
  page: Page;
  letters: string;
}): Promise<{ settledMs: number[]; longestTaskMs: number }> {
  await clearLongTasks({ page });
  const settledMs: number[] = [];
  for (const [index, letter] of Array.from(letters).entries()) {
    await armProbe({ page, expected: letters.slice(0, index + 1) });
    await page.keyboard.press(letter);
    settledMs.push(await awaitSettled({ page }));
  }
  const longTaskDurations = await longTasksAfterQuiet({ page });
  return { settledMs, longestTaskMs: Math.max(0, ...longTaskDurations) };
}

export function median(values: number[]): number {
  const sorted = [...values].sort((first, second) => first - second);
  return sorted[Math.floor(sorted.length / 2)]!;
}

export async function awaitStableScrollHeight({ page }: { page: Page }): Promise<void> {
  await page.getByTestId(EDITOR_TEST_ID).evaluate(
    async (node, { quietMs, attempts }) => {
      let previousHeight = -1;
      for (let attempt = 0; attempt < attempts && node.scrollHeight !== previousHeight; attempt += 1) {
        previousHeight = node.scrollHeight;
        await new Promise((done) => setTimeout(done, quietMs));
      }
    },
    { quietMs: SCROLL_HEIGHT_QUIET_MS, attempts: SCROLL_HEIGHT_ATTEMPTS },
  );
}
