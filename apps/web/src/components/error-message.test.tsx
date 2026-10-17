import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import { ErrorMessage } from './error-message';

const MESSAGE = 'The document could not be loaded.';

test('an error message is announced as an alert', () => {
  render(<ErrorMessage>{MESSAGE}</ErrorMessage>);
  expect(screen.getByRole('alert')).toHaveTextContent(MESSAGE);
});

test('an inset error message is still one alert with its text', () => {
  render(<ErrorMessage className="p-4">{MESSAGE}</ErrorMessage>);
  expect(screen.getAllByRole('alert')).toHaveLength(1);
  expect(screen.getByRole('alert')).toHaveTextContent(MESSAGE);
});
