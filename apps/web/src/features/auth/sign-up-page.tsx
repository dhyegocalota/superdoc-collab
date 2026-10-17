import { zodResolver } from '@hookform/resolvers/zod';
import { AppRoute, signUpSchema, type SignUpInput } from '@superdoc-history/types';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useDocumentTitle } from '@/lib/use-document-title';
import { authClient } from './auth-client';
import {
  EMAIL_FIELD_LABEL,
  HAVE_ACCOUNT_PROMPT,
  NAME_FIELD_LABEL,
  PASSWORD_FIELD_LABEL,
  SIGN_IN_LABEL,
  SIGN_UP_DESCRIPTION,
  SIGN_UP_HEADING,
  SIGN_UP_LABEL,
  SIGN_UP_PENDING_LABEL,
} from './auth-copy';
import { useAuthSubmit } from './use-auth-submit';

export function SignUpPage() {
  const form = useForm<SignUpInput>({ resolver: zodResolver(signUpSchema), defaultValues: { name: '', email: '', password: '' } });
  const submit = useAuthSubmit({
    form,
    request: (values, responseCapture) => authClient.signUp.email(values, responseCapture),
  });
  useDocumentTitle(SIGN_UP_HEADING);

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{SIGN_UP_HEADING}</CardTitle>
          <CardDescription>{SIGN_UP_DESCRIPTION}</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form noValidate onSubmit={form.handleSubmit(submit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{NAME_FIELD_LABEL}</FormLabel>
                    <FormControl>
                      <Input autoComplete="name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{EMAIL_FIELD_LABEL}</FormLabel>
                    <FormControl>
                      <Input type="email" autoComplete="email" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{PASSWORD_FIELD_LABEL}</FormLabel>
                    <FormControl>
                      <Input type="password" autoComplete="new-password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {form.formState.errors.root && (
                <p role="alert" className="text-sm text-destructive">
                  {form.formState.errors.root.message}
                </p>
              )}
              <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? SIGN_UP_PENDING_LABEL : SIGN_UP_LABEL}
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                {HAVE_ACCOUNT_PROMPT}{' '}
                <Link to={AppRoute.SignIn} className="text-primary underline-offset-4 hover:underline">
                  {SIGN_IN_LABEL}
                </Link>
              </p>
            </form>
          </Form>
        </CardContent>
      </Card>
    </main>
  );
}
