'use client';

import { useEffect, useRef, useState } from 'react';

interface PaypalNamespace {
  Buttons(options: {
    createOrder: () => string;
    onApprove: () => Promise<void>;
    onError: (error: unknown) => void;
    onCancel: () => void;
    style?: Record<string, string | number>;
  }): { render(element: HTMLElement): Promise<void>; close(): void };
}

declare global {
  interface Window {
    paypal?: PaypalNamespace;
  }
}

interface Props {
  clientId: string;
  currency: string;
  paypalOrderId: string;
  onApproved: () => Promise<void>;
  onError: () => void;
}

/**
 * PayPal's own buttons. Card details are typed on PayPal's pages, never ours.
 * The order and amount were already set by our server; the buttons only approve it.
 */
export function PaypalButtons({ clientId, currency, paypalOrderId, onApproved, onError }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed' | 'cancelled'>('loading');

  useEffect(() => {
    let buttons: ReturnType<PaypalNamespace['Buttons']> | null = null;
    const src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=${encodeURIComponent(currency)}&intent=capture&components=buttons`;
    const render = () => {
      if (!window.paypal || !container.current) {
        setStatus('failed');
        return;
      }
      buttons = window.paypal.Buttons({
        createOrder: () => paypalOrderId,
        onApprove: onApproved,
        onError: () => onError(),
        onCancel: () => setStatus('cancelled'),
        style: { layout: 'vertical', shape: 'rect', label: 'pay' },
      });
      void buttons.render(container.current).then(() => setStatus('ready'));
    };
    const existing = document.querySelector<HTMLScriptElement>('script[data-paypal-sdk]');
    if (existing && window.paypal) render();
    else {
      const script = existing ?? document.createElement('script');
      script.src = src;
      script.dataset.paypalSdk = 'true';
      script.async = true;
      script.addEventListener('load', render);
      script.addEventListener('error', () => setStatus('failed'));
      if (!existing) document.head.appendChild(script);
    }
    return () => buttons?.close();
  }, [clientId, currency, paypalOrderId, onApproved, onError]);

  return (
    <div>
      {status === 'loading' ? <p role="status">Loading PayPal.</p> : null}
      {status === 'failed' ? (
        <p className="form-error">PayPal could not be loaded. Refresh the page to try again.</p>
      ) : null}
      {status === 'cancelled' ? (
        <p className="notice">
          You closed PayPal before paying. Your order is saved; use the button below to pay.
        </p>
      ) : null}
      <div ref={container} />
    </div>
  );
}
