import { execFileSync } from 'node:child_process';
import type { Browser, CDPSession, Page } from '@playwright/test';

const SAMPLE_INTERVAL_MS = 500;
const KILOBYTES_PER_MEGABYTE = 1024;
const BYTES_PER_MEGABYTE = 1024 * 1024;
const RENDERER_PROCESS_TYPE = 'renderer';
const HEAP_METRIC = 'JSHeapUsedSize';

export type TabMemorySample = { at: number; heapMegabytes: number; residentMegabytes: number };

type ProcessInfo = { type: string; id: number };

function residentMegabytesOf(processIds: number[]): number {
  if (processIds.length === 0) return 0;
  const output = execFileSync('ps', ['-o', 'rss=', '-p', processIds.join(',')], { encoding: 'utf8' });
  const kilobytes = output
    .split('\n')
    .filter((line) => line.trim() !== '')
    .reduce((sum, line) => sum + Number(line), 0);
  return kilobytes / KILOBYTES_PER_MEGABYTE;
}

async function sampleOf({
  pageSession,
  browserSession,
}: {
  pageSession: CDPSession;
  browserSession: CDPSession;
}): Promise<TabMemorySample> {
  const { metrics } = await pageSession.send('Performance.getMetrics');
  const heapBytes = metrics.find((metric) => metric.name === HEAP_METRIC)!.value;
  const { processInfo } = (await browserSession.send('SystemInfo.getProcessInfo')) as { processInfo: ProcessInfo[] };
  const rendererIds = processInfo.filter((info) => info.type === RENDERER_PROCESS_TYPE).map((info) => info.id);
  return { at: Date.now(), heapMegabytes: heapBytes / BYTES_PER_MEGABYTE, residentMegabytes: residentMegabytesOf(rendererIds) };
}

export async function startTabMemorySampler({ browser, page }: { browser: Browser; page: Page }): Promise<() => TabMemorySample[]> {
  const pageSession = await page.context().newCDPSession(page);
  const browserSession = await browser.newBrowserCDPSession();
  await pageSession.send('Performance.enable');
  const samples: TabMemorySample[] = [];
  let isSampling = true;
  const loop = (async () => {
    while (isSampling) {
      samples.push(
        await sampleOf({ pageSession, browserSession }).catch(() => ({ at: Date.now(), heapMegabytes: 0, residentMegabytes: 0 })),
      );
      await new Promise((resolve) => setTimeout(resolve, SAMPLE_INTERVAL_MS));
    }
  })();
  return () => {
    isSampling = false;
    void loop;
    return samples;
  };
}

export function peakIn({ samples, from, to }: { samples: TabMemorySample[]; from: number; to: number }): TabMemorySample {
  const inWindow = samples.filter((sample) => sample.at >= from && sample.at <= to);
  return inWindow.reduce(
    (peak, sample) => ({
      at: sample.at,
      heapMegabytes: Math.max(peak.heapMegabytes, sample.heapMegabytes),
      residentMegabytes: Math.max(peak.residentMegabytes, sample.residentMegabytes),
    }),
    { at: from, heapMegabytes: 0, residentMegabytes: 0 },
  );
}
