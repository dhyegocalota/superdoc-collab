import type { Control, FieldPath, FieldValues } from 'react-hook-form';

export enum AuthFieldType {
  Text = 'text',
  Email = 'email',
  Password = 'password',
}

export function AuthTextField<Values extends FieldValues>(_props: {
  control: Control<Values>;
  name: FieldPath<Values>;
  label: string;
  type: AuthFieldType;
  autoComplete: string;
}) {
  return null;
}
