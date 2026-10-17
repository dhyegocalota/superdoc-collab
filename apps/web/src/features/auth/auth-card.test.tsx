import { AppRoute } from '@superdoc-collab/types';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { expect, test, vi } from 'vitest';
import { renderWithProviders } from '@/testing/render-with-providers';
import { AuthCard } from './auth-card';
import { AuthFieldType, AuthTextField } from './auth-text-field';

const ROOT_ERROR = 'Too many attempts. Try again in 30 seconds.';
const SUBMIT_LABEL = 'Sign in';

type ProbeValues = { email: string };

function Probe({ onSubmit, rootError }: { onSubmit: (values: ProbeValues) => Promise<void>; rootError: string | null }) {
  const form = useForm<ProbeValues>({ defaultValues: { email: '' } });

  useEffect(() => {
    if (rootError === null) return;
    form.setError('root', { message: rootError });
  }, [form, rootError]);

  return (
    <AuthCard
      form={form}
      onSubmit={onSubmit}
      title="Welcome"
      description="Use your email."
      submitLabel={SUBMIT_LABEL}
      pendingLabel="Signing in…"
      link={{ prompt: 'No account yet?', label: 'Sign up', to: AppRoute.SignUp }}
    >
      <AuthTextField control={form.control} name="email" label="Email" type={AuthFieldType.Email} autoComplete="email" />
    </AuthCard>
  );
}

test('the card titles the form, labels its field, submits its values and links onward', async () => {
  const onSubmit = vi.fn(async (_values: ProbeValues) => undefined);
  const user = userEvent.setup();
  renderWithProviders(<Probe onSubmit={onSubmit} rootError={null} />);
  expect(screen.getByText('Welcome')).toBeInTheDocument();
  expect(screen.getByText('Use your email.')).toBeInTheDocument();
  expect(screen.getByLabelText('Email')).toHaveAttribute('type', AuthFieldType.Email);
  expect(screen.getByRole('link', { name: 'Sign up' })).toHaveAttribute('href', AppRoute.SignUp);
  await user.type(screen.getByLabelText('Email'), 'ada@example.com');
  await user.click(screen.getByRole('button', { name: SUBMIT_LABEL }));
  await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
  expect(onSubmit.mock.calls[0]?.[0]).toEqual({ email: 'ada@example.com' });
});

test('a root error is announced as an alert', async () => {
  renderWithProviders(<Probe onSubmit={vi.fn(async () => undefined)} rootError={ROOT_ERROR} />);
  expect(await screen.findByRole('alert')).toHaveTextContent(ROOT_ERROR);
});

test('while submitting the button shows the pending label and is disabled', async () => {
  const user = userEvent.setup();
  renderWithProviders(<Probe onSubmit={() => new Promise<void>(() => undefined)} rootError={null} />);
  await user.click(screen.getByRole('button', { name: SUBMIT_LABEL }));
  expect(await screen.findByRole('button', { name: 'Signing in…' })).toBeDisabled();
});
