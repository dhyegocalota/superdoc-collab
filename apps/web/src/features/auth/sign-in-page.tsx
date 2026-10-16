import { zodResolver } from '@hookform/resolvers/zod';
import { AppRoute, signInSchema, type SignInInput } from '@superdoc-history/types';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { authClient } from './auth-client';
import { useAuthSubmit } from './use-auth-submit';

export function SignInPage() {
  const form = useForm<SignInInput>({ resolver: zodResolver(signInSchema), defaultValues: { email: '', password: '' } });
  const submit = useAuthSubmit({
    form,
    request: (values, responseCapture) => authClient.signIn.email(values, responseCapture),
  });

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>Use your email and password to open your documents.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form noValidate onSubmit={form.handleSubmit(submit)} className="space-y-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
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
                    <FormLabel>Password</FormLabel>
                    <FormControl>
                      <Input type="password" autoComplete="current-password" {...field} />
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
                Sign in
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                No account yet?{' '}
                <Link to={AppRoute.SignUp} className="text-primary underline-offset-4 hover:underline">
                  Sign up
                </Link>
              </p>
            </form>
          </Form>
        </CardContent>
      </Card>
    </main>
  );
}
