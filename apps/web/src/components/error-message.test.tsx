import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import { ErrorMessage } from './error-message';

const MESSAGE = 'The document could not be loaded.';

test('an error message is announced as an alert', () => {
  render(<ErrorMessage>{MESSAGE}</ErrorMessage>);
  expect(screen.getByRole('alert')).toHaveTextContent(MESSAGE);
});
