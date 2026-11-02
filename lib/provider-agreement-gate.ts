import { PROVIDER_AGREEMENT_VERSION } from './provider-agreement';

/**
 * Provider Agreement re-acceptance gate — pure decision logic.
 *
 * Acceptance is recorded on the provider row (`agreement_version`,
 * `agreement_accepted_at`, migration 0035) at onboarding. When
 * PROVIDER_AGREEMENT_VERSION is bumped, providers recorded against an
 * older version must re-accept the current agreement before using
 * provider features again (enforced in middleware.ts for provider
 * pages, and in the provider-mutating API routes).
 *
 * Decision:
 * - 'onboarding' — no provider row yet: the existing onboarding flow
 *   records acceptance itself; this gate never applies.
 * - 'gate' — provider row exists but its recorded version differs from
 *   the current one (including null: pre-versioning rows).
 * - 'pass' — recorded version IS the current version.
 *
 * The current version is always read from the PROVIDER_AGREEMENT_VERSION
 * constant — never hard-code the version string anywhere else.
 */
export type AgreementGateDecision = 'pass' | 'gate' | 'onboarding';

export function isAgreementCurrent(
  recordedVersion: string | null | undefined
): boolean {
  return recordedVersion === PROVIDER_AGREEMENT_VERSION;
}

export function agreementGateDecision(
  recordedVersion: string | null | undefined,
  hasProviderRow: boolean
): AgreementGateDecision {
  if (!hasProviderRow) return 'onboarding';
  return isAgreementCurrent(recordedVersion) ? 'pass' : 'gate';
}
