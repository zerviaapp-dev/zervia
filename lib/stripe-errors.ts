/**
 * Bulletproof Stripe error handling utility.
 * Catches specific Stripe error types and returns safe, user-friendly messages.
 * Never exposes internal system details or raw PCI data.
 */

import Stripe from 'stripe';

export type StripeErrorCode =
  | 'card_declined'
  | 'insufficient_funds'
  | 'expired_card'
  | 'incorrect_cvc'
  | 'processing_error'
  | 'rate_limited'
  | 'invalid_request'
  | 'api_error'
  | 'authentication_error'
  | 'unknown';

export interface SafeStripeError {
  code: StripeErrorCode;
  userMessage: string;
  declineCode?: string;
  retryable: boolean;
  logLevel: 'warn' | 'error' | 'critical';
}

/**
 * Maps a Stripe error to a safe, user-friendly error.
 * Strips all sensitive internal details.
 */
export function mapStripeError(err: unknown): SafeStripeError {
  if (err instanceof Stripe.errors.StripeCardError) {
    const declineCode = err.decline_code;
    switch (declineCode) {
      case 'insufficient_funds':
        return {
          code: 'insufficient_funds',
          userMessage: 'Your card has insufficient funds. Please try a different payment method.',
          declineCode,
          retryable: false,
          logLevel: 'warn',
        };
      case 'expired_card':
        return {
          code: 'expired_card',
          userMessage: 'Your card has expired. Please use a different card.',
          declineCode,
          retryable: false,
          logLevel: 'warn',
        };
      case 'incorrect_cvc':
        return {
          code: 'incorrect_cvc',
          userMessage: 'The security code (CVC) is incorrect. Please check and try again.',
          declineCode,
          retryable: true,
          logLevel: 'warn',
        };
      default:
        return {
          code: 'card_declined',
          userMessage: `Your card was declined${declineCode ? ` (${declineCode.replace(/_/g, ' ')})` : ''}. Please try a different payment method.`,
          declineCode,
          retryable: false,
          logLevel: 'warn',
        };
    }
  }

  if (err instanceof Stripe.errors.StripeRateLimitError) {
    return {
      code: 'rate_limited',
      userMessage: 'Too many requests. Please wait a moment and try again.',
      retryable: true,
      logLevel: 'warn',
    };
  }

  if (err instanceof Stripe.errors.StripeInvalidRequestError) {
    return {
      code: 'invalid_request',
      userMessage: 'There was an issue with the payment request. Please try again or contact support.',
      retryable: false,
      logLevel: 'error',
    };
  }

  if (err instanceof Stripe.errors.StripeAPIError) {
    return {
      code: 'api_error',
      userMessage: 'The payment service is temporarily unavailable. Please try again in a moment.',
      retryable: true,
      logLevel: 'error',
    };
  }

  if (err instanceof Stripe.errors.StripeAuthenticationError) {
    return {
      code: 'authentication_error',
      userMessage: 'Payment system configuration error. Our team has been notified.',
      retryable: false,
      logLevel: 'critical',
    };
  }

  if (err instanceof Stripe.errors.StripeConnectionError) {
    return {
      code: 'api_error',
      userMessage: 'Could not connect to the payment service. Please check your connection and try again.',
      retryable: true,
      logLevel: 'error',
    };
  }

  // Fallback for unknown errors
  const message = err instanceof Error ? err.message : 'Unknown error';
  return {
    code: 'unknown',
    userMessage: 'An unexpected error occurred. Please try again or contact support.',
    retryable: true,
    logLevel: 'error',
  };
}

/**
 * Structured logger for Stripe operations.
 * Logs full context without exposing PCI data or secrets.
 */
export function logStripeError(
  context: {
    operation: string;
    bookingId?: string;
    userId?: string;
    amountCents?: number;
    currency?: string;
  },
  safeError: SafeStripeError,
  rawError: unknown
): void {
  const logEntry = {
    timestamp: new Date().toISOString(),
    severity: safeError.logLevel,
    service: 'zervia-payments',
    operation: context.operation,
    errorCode: safeError.code,
    declineCode: safeError.declineCode,
    // Safe context - NO card numbers, NO CVC, NO secrets
    bookingId: context.bookingId,
    userId: context.userId ? `user_${context.userId.slice(0, 8)}...` : undefined,
    amountCents: context.amountCents,
    currency: context.currency,
    retryable: safeError.retryable,
    // Raw error type for debugging (not the full stack with secrets)
    rawErrorType: rawError instanceof Error ? rawError.constructor.name : typeof rawError,
    rawErrorMessage: rawError instanceof Error ? rawError.message.slice(0, 500) : undefined,
    // High-severity alert tags for Sentry/Datadog/CloudWatch
    tags: {
      alert: safeError.logLevel === 'critical' ? 'P1-payment-critical' : 'P2-payment-error',
      component: 'stripe-checkout',
      retryable: String(safeError.retryable),
    },
  };

  // In production, this goes to your log aggregator
  // console.error is picked up by Vercel, CloudWatch, etc.
  if (safeError.logLevel === 'critical') {
    console.error('[STRIPE-CRITICAL]', JSON.stringify(logEntry));
  } else if (safeError.logLevel === 'error') {
    console.error('[STRIPE-ERROR]', JSON.stringify(logEntry));
  } else {
    console.warn('[STRIPE-WARN]', JSON.stringify(logEntry));
  }
}
