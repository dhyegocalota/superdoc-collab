import type { AppRoute } from '@superdoc-history/types';
import type { ReactNode } from 'react';
import type { FieldValues, UseFormReturn } from 'react-hook-form';

type AuthCardProps<Values extends FieldValues> = {
  form: UseFormReturn<Values>;
  onSubmit: (values: Values) => Promise<void>;
  title: string;
  description: string;
  submitLabel: string;
  pendingLabel: string;
  prompt: string;
  linkLabel: string;
  linkTo: AppRoute;
  children: ReactNode;
};

export function AuthCard<Values extends FieldValues>(_props: AuthCardProps<Values>) {
  return <main />;
}
