import type { AppRoute } from '@superdoc-history/types';
import type { ReactNode } from 'react';
import type { FieldValues, UseFormReturn } from 'react-hook-form';
import { Link } from 'react-router';
import { ErrorMessage } from '@/components/error-message';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form } from '@/components/ui/form';

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

export function AuthCard<Values extends FieldValues>({
  form,
  onSubmit,
  title,
  description,
  submitLabel,
  pendingLabel,
  prompt,
  linkLabel,
  linkTo,
  children,
}: AuthCardProps<Values>) {
  const rootError = form.formState.errors.root;
  const isSubmitting = form.formState.isSubmitting;
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              {children}
              {rootError && <ErrorMessage>{rootError.message}</ErrorMessage>}
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? pendingLabel : submitLabel}
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                {prompt}{' '}
                <Link to={linkTo} className="text-primary underline-offset-4 hover:underline">
                  {linkLabel}
                </Link>
              </p>
            </form>
          </Form>
        </CardContent>
      </Card>
    </main>
  );
}
