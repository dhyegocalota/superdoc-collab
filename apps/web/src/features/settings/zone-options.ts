export type TimeZoneOption = { value: string; label: string };

export function timeZoneOptions({ now, current }: { now: number; current: string }): TimeZoneOption[] {
  throw new Error(`timeZoneOptions is not implemented for ${now} ${current}`);
}
