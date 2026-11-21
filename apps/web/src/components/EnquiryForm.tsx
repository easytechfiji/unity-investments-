'use client';

import { useState } from 'react';
import { formText, postJson } from '../lib/submit';
import { Turnstile } from './Turnstile';

interface Props {
  kind: 'contact' | 'quote';
  productId?: number;
  productName?: string;
  /** A fixed list of sizes to choose from, when the product has one. The choice becomes required. */
  sizeOptions?: string[] | null;
  turnstileSiteKey: string | null;
}

/** The contact form and the product quote form. Sends plain text to the shop by email. */
export function EnquiryForm({
  kind,
  productId,
  productName,
  sizeOptions,
  turnstileSiteKey,
}: Props) {
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const id = (name: string) => `${kind}-${name}`;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (name: string) => formText(form, name);
    setState('sending');
    setError(null);
    const body: Record<string, unknown> = {
      name: text('name'),
      email: text('email'),
      phone: text('phone'),
      message: text('message'),
      website: text('website'),
      turnstileToken: text('cf-turnstile-response') || undefined,
    };
    if (kind === 'contact') body.subject = text('subject') || undefined;
    if (kind === 'quote') {
      body.productId = productId;
      body.quantity = text('quantity') ? Number(text('quantity')) : undefined;
      if (sizeOptions?.length) body.size = text('size');
    }
    const result = await postJson(`/forms/${kind}`, body);
    if (result.ok) {
      setState('sent');
      return;
    }
    setState('idle');
    setFields(result.fields ?? {});
    setError(result.message ?? 'Something went wrong.');
  }

  if (state === 'sent') {
    return (
      <p className="notice" role="status">
        Thank you. Your {kind === 'quote' ? 'quote request' : 'message'} has been sent and we will
        reply by email.
      </p>
    );
  }

  const fieldError = (name: string) =>
    fields[name] ? (
      <p className="field-error" id={id(`${name}-error`)}>
        {fields[name]}
      </p>
    ) : null;
  const invalid = (name: string) =>
    fields[name] ? { 'aria-invalid': true, 'aria-describedby': id(`${name}-error`) } : {};

  return (
    // method="post" so that, if JavaScript fails, personal details never end up in the address bar.
    <form method="post" onSubmit={(event) => void submit(event)} noValidate>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {kind === 'quote' && productName ? <p>Quote for: {productName}</p> : null}
      {kind === 'quote' && sizeOptions?.length ? (
        <div className="field">
          <label htmlFor={id('size')}>Size</label>
          <select id={id('size')} name="size" required defaultValue="" {...invalid('size')}>
            <option value="" disabled>
              Choose a size
            </option>
            {sizeOptions.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
          {fieldError('size')}
        </div>
      ) : null}
      <div className="two-col">
        <div className="field">
          <label htmlFor={id('name')}>Your name</label>
          <input
            id={id('name')}
            name="name"
            type="text"
            autoComplete="name"
            required
            maxLength={100}
            {...invalid('name')}
          />
          {fieldError('name')}
        </div>
        <div className="field">
          <label htmlFor={id('email')}>Email</label>
          <input
            id={id('email')}
            name="email"
            type="email"
            autoComplete="email"
            required
            maxLength={254}
            {...invalid('email')}
          />
          {fieldError('email')}
        </div>
        <div className="field">
          <label htmlFor={id('phone')}>
            Phone <span className="hint">Optional</span>
          </label>
          <input
            id={id('phone')}
            name="phone"
            type="tel"
            autoComplete="tel"
            maxLength={20}
            {...invalid('phone')}
          />
          {fieldError('phone')}
        </div>
        {kind === 'quote' ? (
          <div className="field">
            <label htmlFor={id('quantity')}>
              Quantity <span className="hint">Optional</span>
            </label>
            <input
              id={id('quantity')}
              name="quantity"
              type="number"
              min={1}
              inputMode="numeric"
              {...invalid('quantity')}
            />
            {fieldError('quantity')}
          </div>
        ) : (
          <div className="field">
            <label htmlFor={id('subject')}>
              Subject <span className="hint">Optional</span>
            </label>
            <input
              id={id('subject')}
              name="subject"
              type="text"
              maxLength={150}
              {...invalid('subject')}
            />
            {fieldError('subject')}
          </div>
        )}
      </div>
      <div className="field">
        <label htmlFor={id('message')}>{kind === 'quote' ? 'What do you need?' : 'Message'}</label>
        <textarea
          id={id('message')}
          name="message"
          required
          maxLength={3000}
          {...invalid('message')}
        />
        {fieldError('message')}
      </div>
      {/* Honeypot: hidden from people and screen readers. Only bots fill it in. */}
      <div className="visually-hidden" aria-hidden="true">
        <label htmlFor={id('website')}>Leave this empty</label>
        <input id={id('website')} name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>
      <Turnstile siteKey={turnstileSiteKey} />
      <button className="btn" type="submit" disabled={state === 'sending'}>
        {state === 'sending' ? 'Sending' : kind === 'quote' ? 'Request a quote' : 'Send message'}
      </button>
    </form>
  );
}
