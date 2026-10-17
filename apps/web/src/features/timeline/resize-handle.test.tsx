import { fireEvent, render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { ResizeHandle } from './resize-handle';
import { RESIZE_PANEL_LABEL } from './timeline-copy';
import { PanelPosition } from './use-panel-position';
import { MIN_PANEL_HEIGHT, MIN_PANEL_WIDTH, PANEL_RESIZE_STEP } from './use-panel-width';

const PANEL_HEIGHT = 400;
const MAX_PANEL_HEIGHT = 700;
const PANEL_WIDTH = 500;
const MAX_PANEL_WIDTH = 900;
const POINTER_OFFSET = 300;

function renderHandle({ position }: { position: PanelPosition }) {
  const resizeTo = vi.fn();
  const resizeBy = vi.fn();
  const isBottom = position === PanelPosition.Bottom;
  render(
    <ResizeHandle
      position={position}
      size={isBottom ? PANEL_HEIGHT : PANEL_WIDTH}
      minSize={isBottom ? MIN_PANEL_HEIGHT : MIN_PANEL_WIDTH}
      maxSize={isBottom ? MAX_PANEL_HEIGHT : MAX_PANEL_WIDTH}
      resizeTo={resizeTo}
      resizeBy={resizeBy}
    />,
  );
  const separator = screen.getByRole('separator', { name: RESIZE_PANEL_LABEL });
  separator.setPointerCapture = vi.fn();
  return { separator, resizeTo, resizeBy };
}

test('the row handle is a separator with aria-orientation horizontal and ↑ ↓ step 24 px', () => {
  const { separator, resizeBy } = renderHandle({ position: PanelPosition.Bottom });
  expect(separator).toHaveAttribute('aria-orientation', 'horizontal');
  expect(separator).toHaveAttribute('aria-valuenow', String(PANEL_HEIGHT));
  expect(separator).toHaveAttribute('aria-valuemin', String(MIN_PANEL_HEIGHT));
  expect(separator).toHaveAttribute('aria-valuemax', String(MAX_PANEL_HEIGHT));
  fireEvent.keyDown(separator, { key: 'ArrowUp' });
  expect(resizeBy).toHaveBeenLastCalledWith(PANEL_RESIZE_STEP);
  fireEvent.keyDown(separator, { key: 'ArrowDown' });
  expect(resizeBy).toHaveBeenLastCalledWith(-PANEL_RESIZE_STEP);
  fireEvent.keyDown(separator, { key: 'ArrowLeft' });
  fireEvent.keyDown(separator, { key: 'ArrowRight' });
  expect(resizeBy).toHaveBeenCalledTimes(2);
});

test('the row handle measures the pointer from the bottom of the window', () => {
  const { separator, resizeTo } = renderHandle({ position: PanelPosition.Bottom });
  fireEvent.pointerDown(separator, { pointerId: 1 });
  fireEvent.pointerMove(separator, { buttons: 1, clientY: window.innerHeight - POINTER_OFFSET });
  expect(resizeTo).toHaveBeenCalledExactlyOnceWith(POINTER_OFFSET);
  fireEvent.pointerMove(separator, { buttons: 0, clientY: 0 });
  expect(resizeTo).toHaveBeenCalledTimes(1);
});

test('the column handle stays vertical with ← → and measures from the right of the window', () => {
  const { separator, resizeBy, resizeTo } = renderHandle({ position: PanelPosition.Side });
  expect(separator).toHaveAttribute('aria-orientation', 'vertical');
  expect(separator).toHaveAttribute('aria-valuenow', String(PANEL_WIDTH));
  fireEvent.keyDown(separator, { key: 'ArrowLeft' });
  expect(resizeBy).toHaveBeenLastCalledWith(PANEL_RESIZE_STEP);
  fireEvent.keyDown(separator, { key: 'ArrowRight' });
  expect(resizeBy).toHaveBeenLastCalledWith(-PANEL_RESIZE_STEP);
  fireEvent.keyDown(separator, { key: 'ArrowUp' });
  expect(resizeBy).toHaveBeenCalledTimes(2);
  fireEvent.pointerMove(separator, { buttons: 1, clientX: window.innerWidth - POINTER_OFFSET });
  expect(resizeTo).toHaveBeenCalledExactlyOnceWith(POINTER_OFFSET);
});
