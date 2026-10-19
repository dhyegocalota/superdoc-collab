import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import type { SuperDoc } from 'superdoc';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { superdocStub } from '@/testing/superdoc-stub';
import { ShortcutsDialog } from './shortcuts-dialog';
import {
  PLATFORM_NOTE_LABELS,
  PLATFORM_TOGGLE_LABELS,
  SHORTCUT_GROUP_LABELS,
  SHORTCUTS_EMPTY_MESSAGE,
  SHORTCUTS_SEARCH_LABEL,
  SHORTCUTS_TITLE,
  UNAVAILABLE_SHORTCUT_REASON,
} from './shortcuts-copy';
import { ShortcutGroup } from './shortcuts';
import { Platform } from '@/lib/platform';

const onOpenChange = vi.fn();

function renderDialog({ canEdit = true, superdoc = null }: { canEdit?: boolean; superdoc?: SuperDoc | null } = {}) {
  return render(<ShortcutsDialog isOpen onOpenChange={onOpenChange} canEdit={canEdit} superdoc={superdoc} returnFocusRef={createRef()} />);
}

function rowOf(label: string): HTMLElement {
  const row = screen.getAllByText(label, { selector: 'li span' })[0]?.closest('li');
  if (!row) throw new Error(`no row for ${label}`);
  return row;
}

function pillTexts(row: HTMLElement): (string | null)[] {
  return [...row.querySelectorAll('kbd')].map((pill) => pill.textContent);
}

beforeEach(() => {
  vi.stubGlobal('navigator', { platform: 'Win32' });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

test('every group is a section with its heading and rows with the platform keys', () => {
  renderDialog();
  expect(screen.getByRole('dialog', { name: SHORTCUTS_TITLE })).toBeVisible();
  Object.values(ShortcutGroup).forEach((group) => {
    expect(screen.getByRole('heading', { name: SHORTCUT_GROUP_LABELS[group] })).toBeVisible();
  });
  expect(pillTexts(rowOf('Bold'))).toEqual(['Ctrl', 'B']);
  expect(pillTexts(rowOf('Normal text'))).toEqual(['Ctrl', 'Shift', 'N']);
  expect(screen.getByRole('searchbox', { name: SHORTCUTS_SEARCH_LABEL })).toHaveAttribute('placeholder', SHORTCUTS_SEARCH_LABEL);
});

test('the platform note names the detected platform and the toggle switches the keys', async () => {
  renderDialog();
  expect(screen.getByText(PLATFORM_NOTE_LABELS[Platform.Other])).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: PLATFORM_TOGGLE_LABELS[Platform.Other] }));
  expect(screen.getByText(PLATFORM_NOTE_LABELS[Platform.Mac])).toBeVisible();
  expect(pillTexts(rowOf('Bold'))).toEqual(['⌘', 'B']);
  await userEvent.click(screen.getByRole('button', { name: PLATFORM_TOGGLE_LABELS[Platform.Mac] }));
  expect(pillTexts(rowOf('Bold'))).toEqual(['Ctrl', 'B']);
});

test('the search filters rows and hides the groups with no match', async () => {
  renderDialog();
  await userEvent.type(screen.getByRole('searchbox', { name: SHORTCUTS_SEARCH_LABEL }), 'head');
  expect(rowOf('Heading 1')).toBeVisible();
  expect(rowOf('Heading 3')).toBeVisible();
  expect(screen.queryByText('Bold', { selector: 'li span' })).toBeNull();
  expect(screen.getByRole('heading', { name: SHORTCUT_GROUP_LABELS[ShortcutGroup.Paragraph] })).toBeVisible();
  expect(screen.queryByRole('heading', { name: SHORTCUT_GROUP_LABELS[ShortcutGroup.Formatting] })).toBeNull();
});

test('a search with no match says so', async () => {
  renderDialog();
  await userEvent.type(screen.getByRole('searchbox', { name: SHORTCUTS_SEARCH_LABEL }), 'zzzz');
  expect(screen.getByText(SHORTCUTS_EMPTY_MESSAGE)).toBeVisible();
});

test('a reader sees the navigation, document and app groups only', () => {
  renderDialog({ canEdit: false });
  [ShortcutGroup.Navigation, ShortcutGroup.Document, ShortcutGroup.App].forEach((group) => {
    expect(screen.getByRole('heading', { name: SHORTCUT_GROUP_LABELS[group] })).toBeVisible();
  });
  [ShortcutGroup.Editing, ShortcutGroup.Formatting, ShortcutGroup.Paragraph].forEach((group) => {
    expect(screen.queryByRole('heading', { name: SHORTCUT_GROUP_LABELS[group] })).toBeNull();
  });
  expect(screen.queryByText('Bold', { selector: 'li span' })).toBeNull();
});

test('a command the instance does not support is listed as unavailable', () => {
  const get = (commandId: string) => ({ getState: () => ({ enabled: true, supported: commandId !== 'text-align' }) });
  renderDialog({ superdoc: superdocStub({ ui: { commands: { get } } }) });
  expect(within(rowOf('Centre')).getByText(UNAVAILABLE_SHORTCUT_REASON)).toBeVisible();
  expect(within(rowOf('Increase indent')).queryByText(UNAVAILABLE_SHORTCUT_REASON)).toBeNull();
});

test('Escape asks to close', async () => {
  renderDialog();
  await userEvent.keyboard('{Escape}');
  expect(onOpenChange).toHaveBeenCalledWith(false);
});
