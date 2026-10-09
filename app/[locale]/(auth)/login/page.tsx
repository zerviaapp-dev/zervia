import { Suspense } from 'react';
import { LoginForm } from '@/components/auth/LoginForm';

/** useSearchParams() needs a Suspense boundary during prerender. */
export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
