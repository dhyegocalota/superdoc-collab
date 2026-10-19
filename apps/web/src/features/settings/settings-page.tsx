import { useMemo, useState } from 'react';
import { AppTopBar } from '@/components/app-top-bar';
import { ErrorMessage } from '@/components/error-message';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { AccountMenu } from '@/features/account/account-menu';
import { browserTimeZone } from '@/lib/browser-time-zone';
import { useSession } from '@/features/auth/use-session';
import { useDocumentTitle } from '@/lib/use-document-title';
import { useTimeZone } from '@/lib/use-time-zone';
import {
  browserReportsMessage,
  SAVE_TIME_ZONE_FAILED_MESSAGE,
  SAVE_TIME_ZONE_LABEL,
  SAVING_TIME_ZONE_LABEL,
  SETTINGS_HEADING,
  TIME_ZONE_FIELD_LABEL,
  TIME_ZONE_HEADING,
  USE_BROWSER_TIME_ZONE_LABEL,
} from './settings-copy';
import { useSaveTimeZone } from './use-save-time-zone';
import { displayTimeZone, timeZoneOptions } from './zone-options';

const SELECT_ID = 'time-zone';

export function SettingsPage() {
  const { user } = useSession();
  const { timeZone: effectiveTimeZone } = useTimeZone();
  const [selectedTimeZone, setSelectedTimeZone] = useState(effectiveTimeZone);
  const saveTimeZone = useSaveTimeZone();
  const browserZone = browserTimeZone();
  const storedTimeZone = user?.timeZone;
  const options = useMemo(
    () => timeZoneOptions({ now: Date.now(), extra: storedTimeZone ? [storedTimeZone, browserZone] : [browserZone] }),
    [storedTimeZone, browserZone],
  );
  const browserDiffers = displayTimeZone(browserZone) !== displayTimeZone(effectiveTimeZone);
  useDocumentTitle(SETTINGS_HEADING);

  function chooseTimeZone(timeZone: string): void {
    saveTimeZone.reset();
    setSelectedTimeZone(timeZone);
  }

  function save(): void {
    if (saveTimeZone.isPending) return;
    saveTimeZone.mutate(selectedTimeZone);
  }

  return (
    <div className="min-h-full">
      <AppTopBar right={<AccountMenu colorSlot={null} />} />
      <main className="mx-auto max-w-4xl space-y-8 p-6">
        <h1 className="text-2xl font-semibold">{SETTINGS_HEADING}</h1>
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">{TIME_ZONE_HEADING}</h2>
          <div className="space-y-2">
            <Label htmlFor={SELECT_ID}>{TIME_ZONE_FIELD_LABEL}</Label>
            <select
              id={SELECT_ID}
              value={selectedTimeZone}
              onChange={(event) => chooseTimeZone(event.currentTarget.value)}
              className="h-9 w-full max-w-md rounded-md border bg-background px-3 text-sm shadow-xs"
            >
              {options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          {browserDiffers && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              {browserReportsMessage(browserZone)}
              <Button type="button" variant="outline" size="sm" onClick={() => chooseTimeZone(browserZone)}>
                {USE_BROWSER_TIME_ZONE_LABEL}
              </Button>
            </p>
          )}
          {saveTimeZone.isError && <ErrorMessage>{SAVE_TIME_ZONE_FAILED_MESSAGE}</ErrorMessage>}
          <Button type="button" aria-disabled={saveTimeZone.isPending} onClick={save}>
            {saveTimeZone.isPending ? SAVING_TIME_ZONE_LABEL : SAVE_TIME_ZONE_LABEL}
          </Button>
        </section>
      </main>
    </div>
  );
}
