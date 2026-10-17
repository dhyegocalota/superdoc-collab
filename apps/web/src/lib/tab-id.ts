const pageLoadTabId = crypto.randomUUID();

export function tabId(): string {
  return pageLoadTabId;
}
