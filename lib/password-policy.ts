/**
 * Password policy (live-test fix batch Z6, Oct 20 2026): at least 8
 * characters, a letter, a number and a special character. Enforced
 * server-side in lib/supabase/actions.ts and shown live as a ticking
 * checklist by components/auth/PasswordFields.tsx. Supabase's own
 * project minimum is lower (dashboard default), so this app policy is
 * the binding one for passwords set through Zervia forms.
 */
export function passwordMeetsPolicy(password: string): boolean {
  return (
    password.length >= 8 &&
    /[A-Za-z]/.test(password) &&
    /\d/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  );
}
