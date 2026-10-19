import type { Page } from '@playwright/test';
import { DEMO_USERS, documentApiPath, DocumentResource, type DocumentTimeline, type TimelineBin } from '../libs/types/src';
import { cellVolume } from '../libs/history/src/timeline';
import { IDLE_BREAK_MS } from '../apps/web/src/features/timeline/streamgraph-layout';
import { NO_EDITS_FOR_LABEL } from '../apps/web/src/features/timeline/timeline-copy';
import { typeInParagraph, uploadSeed } from './editor';
import { expect, signedInContext, test } from './fixtures';
import { BUDGET, chartSvg, currentAt, expandPanel, pressInChart, readTimeline, waitForBands, waitForSettledTimeline } from './timeline';

const PARAGRAPHS = ['Budget: the plan costs 10.', 'Hiring: we add two people.'];
const EDIT_TEXT = ' More money for the plan, a second sentence about the budget lines and a third one about the hiring plan.';
const DIVIDER_SELECTOR = 'line[stroke-dasharray]';
const SILENCE_MARGIN_BINS = 2;
const TOOLTIP_Y = 100;

function hasEdits(bin: TimelineBin): boolean {
  return Object.values(bin.byBand).some((cell) => cellVolume(cell) > 0);
}

function silentBinsAfter({ timeline, count }: { timeline: DocumentTimeline; count: number }): TimelineBin[] {
  const lastEnd = timeline.bins.at(-1)!.end;
  return Array.from({ length: count }, (_, index) => ({
    start: lastEnd + index * timeline.binMs,
    end: lastEnd + (index + 1) * timeline.binMs,
    versionSequence: timeline.bins.at(-1)!.versionSequence,
    byBand: {},
  }));
}

function withSilence({ timeline, silentBinCount }: { timeline: DocumentTimeline; silentBinCount: number }): DocumentTimeline {
  const firstEditedIndex = timeline.bins.findIndex(hasEdits);
  const shiftMs = (timeline.bins.length + silentBinCount - firstEditedIndex) * timeline.binMs;
  const laterBins = timeline.bins.slice(firstEditedIndex).map((bin) => ({ ...bin, start: bin.start + shiftMs, end: bin.end + shiftMs }));
  return { ...timeline, bins: [...timeline.bins, ...silentBinsAfter({ timeline, count: silentBinCount }), ...laterBins] };
}

async function serveTimeline({
  page,
  documentId,
  timeline,
}: {
  page: Page;
  documentId: string;
  timeline: DocumentTimeline;
}): Promise<void> {
  const timelinePath = documentApiPath({ documentId, resource: DocumentResource.Timeline });
  await page.route(
    (url) => url.pathname === timelinePath,
    (route) => route.fulfill({ json: timeline }),
  );
}

test('a silence of more than five minutes is one break the keyboard crosses in one press', async ({ browser }) => {
  const ana = await signedInContext({ browser, user: DEMO_USERS[0]! });
  const documentId = await uploadSeed({ page: ana.page, paragraphs: PARAGRAPHS });
  await typeInParagraph({ page: ana.page, paragraphText: 'Budget:', text: EDIT_TEXT });
  await waitForBands({ page: ana.page, names: [BUDGET] });
  await waitForSettledTimeline({ page: ana.page, documentId });
  const real = await readTimeline({ page: ana.page, documentId });
  const silentBinCount = Math.ceil(IDLE_BREAK_MS / real.binMs) + SILENCE_MARGIN_BINS;
  const served = withSilence({ timeline: real, silentBinCount });
  const lastEditedBefore = real.bins.findLastIndex(hasEdits);
  const firstBinAfterBreak = real.bins.length + silentBinCount;

  await serveTimeline({ page: ana.page, documentId, timeline: served });
  await ana.page.reload();
  await expandPanel(ana.page);
  await expect(chartSvg(ana.page)).toBeVisible();

  const dividers = chartSvg(ana.page).locator(DIVIDER_SELECTOR);
  await expect(dividers).toHaveCount(1);
  const dividerX = Number(await dividers.getAttribute('x1'));
  await chartSvg(ana.page).hover({ position: { x: dividerX, y: TOOLTIP_Y } });
  await expect(ana.page.getByRole('tooltip')).toContainText(NO_EDITS_FOR_LABEL);

  await pressInChart({ page: ana.page, name: BUDGET, keys: ['Home', ...Array.from({ length: lastEditedBefore }, () => 'ArrowRight')] });
  await expect.poll(() => currentAt(ana.page)).toBe(served.bins[lastEditedBefore]!.start);
  await ana.page.keyboard.press('ArrowRight');
  await expect.poll(() => currentAt(ana.page)).toBe(served.bins[firstBinAfterBreak]!.start);
});
