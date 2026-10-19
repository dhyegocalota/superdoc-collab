import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { expect, test } from 'vitest';
import { Form, FormField, FormItem, FormMessage } from './form';

const FIELD_NAME = 'title';
const ERROR_MESSAGE = 'Title is required';
const HINT = 'Shown to everyone';

function TestForm({ error, children }: { error?: { message?: string }; children?: ReactNode }) {
  const form = useForm({ errors: error ? { [FIELD_NAME]: { type: 'manual', ...error } } : {} });
  return (
    <Form {...form}>
      <FormField
        control={form.control}
        name={FIELD_NAME}
        render={() => (
          <FormItem>
            <FormMessage>{children}</FormMessage>
          </FormItem>
        )}
      />
    </Form>
  );
}

test('shows the error message in place of the children', () => {
  render(<TestForm error={{ message: ERROR_MESSAGE }}>{HINT}</TestForm>);

  expect(screen.getByText(ERROR_MESSAGE)).toBeInTheDocument();
  expect(screen.queryByText(HINT)).not.toBeInTheDocument();
});

test('shows the children when the field has no error', () => {
  render(<TestForm>{HINT}</TestForm>);

  expect(screen.getByText(HINT)).toBeInTheDocument();
});

test('renders nothing when there is neither an error nor children', () => {
  const { container } = render(<TestForm />);

  expect(container.querySelector('[data-slot="form-message"]')).toBeNull();
});

test('renders nothing when the field has an error without a message, even with children', () => {
  const { container } = render(<TestForm error={{}}>{HINT}</TestForm>);

  expect(screen.queryByText(HINT)).not.toBeInTheDocument();
  expect(container.querySelector('[data-slot="form-message"]')).toBeNull();
});
