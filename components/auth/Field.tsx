'use client';

import type { ReactNode } from 'react';

type FieldProps = {
  label: string;
  error?: string;
  children: ReactNode;
  htmlFor: string;
};

/**
 * Labelled form field with an inline error slot.
 * Inputs/selects inside get 56px tap targets via the `auth-input` class
 * (defined in globals.css) — senior-friendly, one-tap use.
 */
export function Field({ label, error, children, htmlFor }: FieldProps) {
  const errorId = `${htmlFor}-error`;
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="mb-2 block text-base font-semibold text-brand-900"
      >
        {label}
      </label>
      {children}
      {error ? (
        <p id={errorId} role="alert" className="mt-2 text-sm font-medium text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
