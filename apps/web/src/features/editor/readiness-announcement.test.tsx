import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import { ReadinessAnnouncement } from './readiness-announcement';
import { DocumentReadiness } from './use-opened-document';
import { DOCUMENT_READY_ANNOUNCEMENT } from './waiting-copy';

test('moving from Waiting to Ready announces that the document is ready', () => {
  const { rerender } = render(<ReadinessAnnouncement readiness={DocumentReadiness.Waiting} />);
  expect(screen.getByRole('status')).toBeEmptyDOMElement();
  rerender(<ReadinessAnnouncement readiness={DocumentReadiness.Ready} />);
  expect(screen.getByRole('status')).toHaveTextContent(DOCUMENT_READY_ANNOUNCEMENT);
});

test('a document that opens Ready at once announces nothing', () => {
  const { rerender } = render(<ReadinessAnnouncement readiness={DocumentReadiness.Opening} />);
  rerender(<ReadinessAnnouncement readiness={DocumentReadiness.Ready} />);
  expect(screen.getByRole('status')).toBeEmptyDOMElement();
});
