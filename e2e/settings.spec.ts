import { DEMO_USERS } from '../libs/types/src';
import { insertInParagraph, uploadSeed } from './editor';
import { expect, signedInContext, test } from './fixtures';
import { bandNamed, waitForBands, waitForSettledTimeline } from './timeline';
import { E2E_TIME_ZONE } from './time-zone';

const SETTINGS_ROUTE = '/settings';
const TIME_ZONE_LABEL = 'Time zone';
const SAVE_LABEL = 'Save';
const TIME_ZONE_SAVED_MESSAGE = 'Time zone saved';
const KATHMANDU_TIME_ZONE = 'Asia/Kathmandu';
const BAND_NAME = 'Budget';
const PARAGRAPHS = ['Budget: the plan costs 10.', 'Hiring: we add two people.'];
const EDIT_TEXT = ' More money';
const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR;
const KATHMANDU_AHEAD_OF_SAO_PAULO_MINUTES = 8 * MINUTES_PER_HOUR + 45;
const CLOCK_TIME_PATTERN = /(\d{1,2}):(\d{2})(?::\d{2})?\s?([AP])M/;
const AFTERNOON_MARKER = 'P';
const NOON_HOUR = 12;

function timesIn(zone: string): string {
  return `Times in ${zone}`;
}

function minutesOfDayIn(tooltipText: string): number {
  const [, hourText, minuteText, meridiem] = CLOCK_TIME_PATTERN.exec(tooltipText)!;
  const hourOfHalfDay = Number(hourText) % NOON_HOUR;
  const hour = meridiem === AFTERNOON_MARKER ? hourOfHalfDay + NOON_HOUR : hourOfHalfDay;
  return hour * MINUTES_PER_HOUR + Number(minuteText);
}

test('choosing another time zone moves the timeline label and the tooltip range', async ({ browser }) => {
  const { page, context } = await signedInContext({ browser, user: DEMO_USERS[0]! });
  const documentId = await uploadSeed({ page, paragraphs: PARAGRAPHS });
  await insertInParagraph({ page, paragraphText: 'Budget:', text: EDIT_TEXT });
  await waitForBands({ page, names: [BAND_NAME] });
  await waitForSettledTimeline({ page, documentId });
  await expect(page.getByText(timesIn(E2E_TIME_ZONE))).toBeVisible();
  await bandNamed({ page, name: BAND_NAME }).hover();
  const saoPauloMinutes = minutesOfDayIn(await page.getByRole('tooltip').innerText());

  await page.goto(SETTINGS_ROUTE);
  await page.getByLabel(TIME_ZONE_LABEL).selectOption(KATHMANDU_TIME_ZONE);
  await page.getByRole('button', { name: SAVE_LABEL }).click();
  await expect(page.getByText(TIME_ZONE_SAVED_MESSAGE)).toBeVisible();

  await page.goto(`/documents/${documentId}`);
  await waitForBands({ page, names: [BAND_NAME] });
  await expect(page.getByText(timesIn(KATHMANDU_TIME_ZONE))).toBeVisible();
  await bandNamed({ page, name: BAND_NAME }).hover();
  const kathmanduMinutes = minutesOfDayIn(await page.getByRole('tooltip').innerText());
  const shiftMinutes = (kathmanduMinutes - saoPauloMinutes + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  expect(shiftMinutes).toBe(KATHMANDU_AHEAD_OF_SAO_PAULO_MINUTES);
  await context.close();
});
