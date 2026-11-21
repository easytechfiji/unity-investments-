'use client';

import type { OrderSummary } from '@od/shared';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { postJson } from '../lib/submit';
import { EMAIL_KEY } from './CheckoutForm';
import { OrderView } from './OrderView';

/**
 * Finds an order by its long reference plus the email it was placed with.
 * After checkout the email is remembered for this browser tab only, so the
 * confirmation shows straight away.
 */
export function OrderLookup({ confirmation = false }: { confirmation?: boolean }) {
  const searchParams = useSearchParams();
  const initialReference = (searchParams.get('reference') ?? '').toLowerCase();
  const [reference, setReference] = useState(initialReference);
  const [email, setEmail] = useState('');
  const [found, setFound] = useState<{ order: OrderSummary; email: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const order = found?.order ?? null;

  async function lookup(ref: string, mail: string): Promise<void> {
    const result = await postJson<OrderSummary>('/orders/lookup', {
      reference: ref.trim(),
      email: mail.trim(),
    });
    setBusy(false);
    if (result.ok && result.data) {
      setFound({ order: result.data, email: mail.trim() });
      setError(null);
    } else {
      setError(
        result.fields?.reference ?? result.fields?.email ?? result.message ?? 'No order found.',
      );
    }
  }

  function find(ref: string, mail: string) {
    setBusy(true);
    setError(null);
    void lookup(ref, mail);
  }

  // Straight after checkout this tab remembers the email, so the order shows at once.
  useEffect(() => {
    if (!initialReference) return;
    let remembered: string;
    try {
      remembered = window.sessionStorage.getItem(EMAIL_KEY) ?? '';
    } catch {
      remembered = '';
    }
    if (!remembered) return;
    void postJson<OrderSummary>('/orders/lookup', {
      reference: initialReference,
      email: remembered,
    }).then((result) => {
      if (result.ok && result.data) setFound({ order: result.data, email: remembered });
    });
  }, [initialReference]);

  if (order) {
    return (
      <>
        {confirmation ? (
          <p className="notice" role="status">
            Thank you. Your order {order.orderNumber} has been placed and a confirmation email is on
            its way to {order.email}.
          </p>
        ) : null}
        <OrderView order={order} email={found?.email ?? email} />
      </>
    );
  }

  return (
    <form
      method="post"
      className="prose"
      onSubmit={(event) => {
        event.preventDefault();
        find(reference, email);
      }}
    >
      <p>
        Enter the order reference from your confirmation email and the email address you ordered
        with.
      </p>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="field">
        <label htmlFor="lookup-reference">Order reference</label>
        <input
          id="lookup-reference"
          type="text"
          value={reference}
          onChange={(event) => setReference(event.target.value)}
          maxLength={32}
          autoComplete="off"
          spellCheck={false}
        />
      </div>
      <div className="field">
        <label htmlFor="lookup-email">Email</label>
        <input
          id="lookup-email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
          maxLength={254}
        />
      </div>
      <button className="btn" type="submit" disabled={busy}>
        {busy ? 'Finding your order' : 'Find my order'}
      </button>
    </form>
  );
}
