import type { Control, FieldPath, FieldValues } from 'react-hook-form';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';

export enum AuthFieldType {
  Text = 'text',
  Email = 'email',
  Password = 'password',
}

export function AuthTextField<Values extends FieldValues>({
  control,
  name,
  label,
  type,
  autoComplete,
}: {
  control: Control<Values>;
  name: FieldPath<Values>;
  label: string;
  type: AuthFieldType;
  autoComplete: string;
}) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input type={type} autoComplete={autoComplete} {...field} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
