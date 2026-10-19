import { expect, type Page } from '@playwright/test';
import { APP_SHELL_SCROLLER_TEST_ID } from '../libs/types/src';

type SidewaysOverflow = { document: number; scroller: number };

export function sidewaysOverflowOf(page: Page): Promise<SidewaysOverflow> {
  return page.evaluate((scrollerTestId) => {
    const root = document.documentElement;
    const scroller = document.querySelector(`[data-testid="${scrollerTestId}"]`)!;
    return { document: root.scrollWidth - root.clientWidth, scroller: scroller.scrollWidth - scroller.clientWidth };
  }, APP_SHELL_SCROLLER_TEST_ID);
}

export async function expectNoSidewaysScroll(page: Page): Promise<void> {
  await expect(page.getByTestId(APP_SHELL_SCROLLER_TEST_ID)).toBeAttached();
  await expect.poll(() => sidewaysOverflowOf(page)).toEqual({ document: 0, scroller: 0 });
}
