import { useMemo, useState } from 'react';
import { ErrorMessage } from '@/components/error-message';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { SignOutButton } from '@/features/auth/sign-out-button';
import { HomeLink } from '@/features/editor/home-link';
import { browserTimeZone } from '@/lib/browser-time-zone';
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
import { timeZoneOptions } from './zone-options';

const SELECT_ID = 'time-zone';

export function SettingsPage() {
  const { timeZone: effectiveTimeZone } = useTimeZone();
  const [selectedTimeZone, setSelectedTimeZone] = useState(effectiveTimeZone);
  const saveTimeZone = useSaveTimeZone();
  const options = useMemo(() => timeZoneOptions({ now: Date.now(), current: effectiveTimeZone }), [effectiveTimeZone]);
  const browserZone = browserTimeZone();
  useDocumentTitle(SETTINGS_HEADING);

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between gap-4 border-b px-6 py-4">
        <HomeLink />
        <SignOutButton />
      </header>
      <main className="mx-auto max-w-4xl space-y-8 p-6">
        <h1 className="text-2xl font-semibold">{SETTINGS_HEADING}</h1>
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">{TIME_ZONE_HEADING}</h2>
          <div className="space-y-2">
            <Label htmlFor={SELECT_ID}>{TIME_ZONE_FIELD_LABEL}</Label>
            <select
              id={SELECT_ID}
              value={selectedTimeZone}
              onChange={(event) => setSelectedTimeZone(event.currentTarget.value)}
              className="h-9 w-full max-w-md rounded-md border bg-background px-3 text-sm shadow-xs"
            >
              {options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          {browserZone !== effectiveTimeZone && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              {browserReportsMessage(browserZone)}
              <Button type="button" variant="outline" size="sm" onClick={() => setSelectedTimeZone(browserZone)}>
                {USE_BROWSER_TIME_ZONE_LABEL}
              </Button>
            </p>
          )}
          {saveTimeZone.isError && <ErrorMessage>{SAVE_TIME_ZONE_FAILED_MESSAGE}</ErrorMessage>}
          <Button type="button" disabled={saveTimeZone.isPending} onClick={() => saveTimeZone.mutate(selectedTimeZone)}>
            {saveTimeZone.isPending ? SAVING_TIME_ZONE_LABEL : SAVE_TIME_ZONE_LABEL}
          </Button>
        </section>
      </main>
    </div>
  );
}
