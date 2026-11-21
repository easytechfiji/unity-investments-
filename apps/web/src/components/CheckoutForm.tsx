'use client';

import {
  FIJI_DIVISIONS,
  checkoutSchema,
  formatPrice,
  toCents,
  type CreatedOrder,
  type ShippingRegion,
} from '@od/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { cart } from '../lib/cart';
import type { ContactLinks } from '../lib/contact';
import { formText, postJson } from '../lib/submit';
import { problemText, usePricedCart } from './CartView';
import { DeliveryQuote } from './DeliveryQuote';
import { PaypalButtons } from './PaypalButtons';

interface Props {
  regions: ShippingRegion[];
  contact: ContactLinks;
  paypal: { available: boolean; clientId: string | null; currency: string | null };
}

const TOKEN_KEY = 'od-checkout-token';
export const EMAIL_KEY = 'od-last-order-email';

const money = (value: string) => formatPrice(toCents(value));

function checkoutToken(): string {
  try {
    const existing = window.sessionStorage.getItem(TOKEN_KEY);
    if (existing) return existing;
    const token = crypto.randomUUID();
    window.sessionStorage.setItem(TOKEN_KEY, token);
    return token;
  } catch {
    return crypto.randomUUID();
  }
}

function forgetToken() {
  try {
    window.sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    // Storage blocked: nothing to forget.
  }
}

export function CheckoutForm({ regions, paypal, contact }: Props) {
  const router = useRouter();
  const [delivery, setDelivery] = useState<'click_and_collect' | 'shipping'>('click_and_collect');
  const [regionId, setRegionId] = useState<number | undefined>(undefined);
  const [payment, setPayment] = useState<'bank_transfer' | 'paypal'>('bank_transfer');
  const [shipElsewhere, setShipElsewhere] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [paypalOrder, setPaypalOrder] = useState<{
    reference: string;
    paypalOrderId: string;
    email: string;
  } | null>(null);
  const errorBox = useRef<HTMLParagraphElement>(null);

  const { lines, priced, loading } = usePricedCart({
    deliveryMethod: delivery,
    ...(delivery === 'shipping' && regionId ? { regionId } : {}),
  });

  useEffect(() => {
    if (formError) errorBox.current?.focus();
  }, [formError]);

  if (lines.length === 0 && !paypalOrder) {
    return (
      <div className="prose">
        <p>Your cart is empty.</p>
        <p>
          <Link href="/collection">Browse all categories</Link>
        </p>
      </div>
    );
  }

  function finish(reference: string, email: string) {
    try {
      window.sessionStorage.setItem(EMAIL_KEY, email);
    } catch {
      // The confirmation page will ask for the email instead.
    }
    forgetToken();
    cart.clear();
    router.push(`/order-confirmation?reference=${reference}`);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (name: string) => formText(form, name).trim();
    const address = (prefix: string) => ({
      streetNumber: text(`${prefix}streetNumber`) || undefined,
      streetName: text(`${prefix}streetName`),
      city: text(`${prefix}city`),
      division: text(`${prefix}division`),
    });
    const input = {
      checkoutToken: checkoutToken(),
      email: text('email'),
      firstName: text('firstName'),
      lastName: text('lastName') || undefined,
      phone: text('phone'),
      deliveryMethod: delivery,
      ...(delivery === 'shipping'
        ? {
            regionId,
            address: address(''),
            shipToDifferentAddress: shipElsewhere,
            ...(shipElsewhere
              ? {
                  recipient: {
                    firstName: text('r_firstName'),
                    lastName: text('r_lastName') || undefined,
                    phone: text('r_phone'),
                    address: address('r_'),
                  },
                }
              : {}),
          }
        : {}),
      paymentMethod: payment,
      note: text('note') || undefined,
      lines,
      expectedTotal: priced?.total,
    };

    // Check in the browser first for quick, friendly errors. The API checks everything again.
    const local = checkoutSchema.safeParse(input);
    if (!local.success) {
      const found: Record<string, string> = {};
      for (const issue of local.error.issues) found[issue.path.join('.')] ??= issue.message;
      setErrors(found);
      setFormError('Please check the details marked below.');
      return;
    }
    setErrors({});
    setFormError(null);
    setSending(true);
    const result = await postJson<CreatedOrder>('/orders', input);
    setSending(false);
    if (!result.ok || !result.data) {
      setErrors(result.fields ?? {});
      setFormError(result.message ?? 'Your order could not be placed.');
      return;
    }
    if (result.data.paymentMethod === 'paypal' && result.data.paypalOrderId) {
      setPaypalOrder({
        reference: result.data.reference,
        paypalOrderId: result.data.paypalOrderId,
        email: input.email,
      });
      return;
    }
    finish(result.data.reference, input.email);
  }

  const err = (name: string) =>
    errors[name] ? (
      <p className="field-error" id={`err-${name}`}>
        {errors[name]}
      </p>
    ) : null;
  const invalid = (name: string) =>
    errors[name] ? { 'aria-invalid': true, 'aria-describedby': `err-${name}` } : {};

  const addressFields = (prefix: '' | 'r_', path: string) => (
    <>
      <div className="two-col">
        <div className="field">
          <label htmlFor={`${prefix}streetNumber`}>
            Lot or street number <span className="hint">Optional</span>
          </label>
          <input
            id={`${prefix}streetNumber`}
            name={`${prefix}streetNumber`}
            type="text"
            maxLength={20}
            autoComplete={prefix ? 'off' : 'address-line2'}
            {...invalid(`${path}.streetNumber`)}
          />
          {err(`${path}.streetNumber`)}
        </div>
        <div className="field">
          <label htmlFor={`${prefix}streetName`}>Street or road</label>
          <input
            id={`${prefix}streetName`}
            name={`${prefix}streetName`}
            type="text"
            maxLength={200}
            autoComplete={prefix ? 'off' : 'address-line1'}
            {...invalid(`${path}.streetName`)}
          />
          {err(`${path}.streetName`)}
        </div>
        <div className="field">
          <label htmlFor={`${prefix}city`}>Town or city</label>
          <input
            id={`${prefix}city`}
            name={`${prefix}city`}
            type="text"
            maxLength={100}
            autoComplete={prefix ? 'off' : 'address-level2'}
            {...invalid(`${path}.city`)}
          />
          {err(`${path}.city`)}
        </div>
        <div className="field">
          <label htmlFor={`${prefix}division`}>Division</label>
          <select
            id={`${prefix}division`}
            name={`${prefix}division`}
            defaultValue=""
            {...invalid(`${path}.division`)}
          >
            <option value="" disabled>
              Choose a division
            </option>
            {FIJI_DIVISIONS.map((division) => (
              <option key={division} value={division}>
                {division}
              </option>
            ))}
          </select>
          {err(`${path}.division`)}
        </div>
      </div>
      <p className="hint">Country: Fiji. We deliver within Fiji only.</p>
    </>
  );

  if (paypalOrder && paypal.clientId && paypal.currency) {
    return (
      <div className="prose">
        <p className="notice">
          Your order is saved. Pay with PayPal below to finish. The amount is in {paypal.currency}.
        </p>
        {formError ? (
          <p className="form-error" role="alert">
            {formError}
          </p>
        ) : null}
        <PaypalButtons
          clientId={paypal.clientId}
          currency={paypal.currency}
          paypalOrderId={paypalOrder.paypalOrderId}
          onApproved={async () => {
            const result = await postJson('/orders/paypal/capture', {
              reference: paypalOrder.reference,
              paypalOrderId: paypalOrder.paypalOrderId,
            });
            if (result.ok) finish(paypalOrder.reference, paypalOrder.email);
            else setFormError(result.message ?? 'The payment could not be confirmed.');
          }}
          onError={() =>
            setFormError(
              'PayPal could not complete the payment. You can try again, or contact us with your order details.',
            )
          }
        />
      </div>
    );
  }

  return (
    <form
      method="post"
      className="checkout-layout"
      onSubmit={(event) => void submit(event)}
      noValidate
    >
      <div>
        {formError ? (
          <p className="form-error" role="alert" tabIndex={-1} ref={errorBox}>
            {formError}
          </p>
        ) : null}

        <section className="checkout-section" aria-labelledby="contact-title">
          <h2 id="contact-title">Your details</h2>
          <div className="two-col">
            <div className="field">
              <label htmlFor="firstName">First name</label>
              <input
                id="firstName"
                name="firstName"
                type="text"
                autoComplete="given-name"
                maxLength={100}
                {...invalid('firstName')}
              />
              {err('firstName')}
            </div>
            <div className="field">
              <label htmlFor="lastName">
                Last name <span className="hint">Optional</span>
              </label>
              <input
                id="lastName"
                name="lastName"
                type="text"
                autoComplete="family-name"
                maxLength={100}
                {...invalid('lastName')}
              />
              {err('lastName')}
            </div>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                maxLength={254}
                {...invalid('email')}
              />
              {err('email')}
            </div>
            <div className="field">
              <label htmlFor="phone">
                Phone <span className="hint">For delivery questions</span>
              </label>
              <input
                id="phone"
                name="phone"
                type="tel"
                autoComplete="tel"
                placeholder="+679"
                maxLength={20}
                {...invalid('phone')}
              />
              {err('phone')}
            </div>
          </div>
        </section>

        <section className="checkout-section" aria-labelledby="delivery-title">
          <h2 id="delivery-title">Delivery</h2>
          <fieldset className="filters-reset">
            <legend className="visually-hidden">Delivery method</legend>
            <label className="choice">
              <input
                type="radio"
                name="deliveryMethod"
                value="click_and_collect"
                checked={delivery === 'click_and_collect'}
                onChange={() => setDelivery('click_and_collect')}
              />
              <span>
                <strong>Click And Collect, free</strong>
                Pick up from our shop in Nakasi. We contact you when it is ready.
              </span>
            </label>
            {regions.length > 0 ? (
              <label className="choice">
                <input
                  type="radio"
                  name="deliveryMethod"
                  value="shipping"
                  checked={delivery === 'shipping'}
                  onChange={() => setDelivery('shipping')}
                />
                <span>
                  <strong>Delivery in Fiji</strong>
                  Charged by region, shown below before you pay.
                </span>
              </label>
            ) : (
              // No delivery prices in the admin yet: delivery is arranged by quote.
              <p className="notice">
                <strong>Need it delivered?</strong> <DeliveryQuote contact={contact} />
              </p>
            )}
          </fieldset>
          {delivery === 'shipping' ? (
            <>
              <div className="field">
                <label htmlFor="regionId">Delivery region</label>
                <select
                  id="regionId"
                  value={regionId ?? ''}
                  onChange={(event) =>
                    setRegionId(event.target.value ? Number(event.target.value) : undefined)
                  }
                  {...invalid('regionId')}
                >
                  <option value="">Choose a region</option>
                  {regions.map((region) => (
                    <option key={region.id} value={region.id}>
                      {region.name}, {money(region.price)}
                    </option>
                  ))}
                </select>
                {err('regionId')}
              </div>
              <h3>Delivery address</h3>
              {addressFields('', 'address')}
              <label className="check">
                <input
                  type="checkbox"
                  checked={shipElsewhere}
                  onChange={(event) => setShipElsewhere(event.target.checked)}
                />
                Send to someone else
              </label>
              {shipElsewhere ? (
                <>
                  <h3>Recipient</h3>
                  <div className="two-col">
                    <div className="field">
                      <label htmlFor="r_firstName">First name</label>
                      <input
                        id="r_firstName"
                        name="r_firstName"
                        type="text"
                        maxLength={100}
                        {...invalid('recipient.firstName')}
                      />
                      {err('recipient.firstName')}
                    </div>
                    <div className="field">
                      <label htmlFor="r_lastName">
                        Last name <span className="hint">Optional</span>
                      </label>
                      <input id="r_lastName" name="r_lastName" type="text" maxLength={100} />
                    </div>
                    <div className="field">
                      <label htmlFor="r_phone">Phone</label>
                      <input
                        id="r_phone"
                        name="r_phone"
                        type="tel"
                        maxLength={20}
                        {...invalid('recipient.phone')}
                      />
                      {err('recipient.phone')}
                    </div>
                  </div>
                  {addressFields('r_', 'recipient.address')}
                </>
              ) : null}
            </>
          ) : null}
        </section>

        <section className="checkout-section" aria-labelledby="payment-title">
          <h2 id="payment-title">Payment</h2>
          <fieldset className="filters-reset">
            <legend className="visually-hidden">Payment method</legend>
            <label className="choice">
              <input
                type="radio"
                name="paymentMethod"
                value="bank_transfer"
                checked={payment === 'bank_transfer'}
                onChange={() => setPayment('bank_transfer')}
              />
              <span>
                <strong>Bank transfer</strong>
                After you place the order we show our bank details and your order number to use as
                the payment reference.
              </span>
            </label>
            {paypal.available ? (
              <label className="choice">
                <input
                  type="radio"
                  name="paymentMethod"
                  value="paypal"
                  checked={payment === 'paypal'}
                  onChange={() => setPayment('paypal')}
                />
                <span>
                  <strong>PayPal</strong>
                  PayPal cannot charge Fijian dollars, so it charges {paypal.currency}. The amount
                  is shown in the summary before you pay.
                </span>
              </label>
            ) : null}
          </fieldset>
          <div className="field">
            <label htmlFor="note">
              Notes for the shop <span className="hint">Optional</span>
            </label>
            <textarea id="note" name="note" maxLength={1000} {...invalid('note')} />
            {err('note')}
          </div>
        </section>
      </div>

      <aside className="checkout-aside" aria-labelledby="summary-title">
        <div className="totals">
          <h2 id="summary-title">Order summary</h2>
          <table className="summary-table">
            <caption className="visually-hidden">Items</caption>
            <tbody>
              {(priced?.lines ?? []).map((line) => (
                <tr key={`${line.productId}-${line.variantId ?? 0}`}>
                  <td>
                    {line.quantity} x {line.name}
                    {line.variantLabel ? `, ${line.variantLabel}` : ''}
                    {line.problem ? (
                      <div className="line-problem">
                        {problemText(line.problem, line.available)}
                      </div>
                    ) : null}
                  </td>
                  <td className="num">{line.lineTotal ? money(line.lineTotal) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <dl className="hours">
            <dt>Subtotal</dt>
            <dd>{priced ? money(priced.subtotal) : ''}</dd>
            <dt>Delivery</dt>
            <dd>
              {priced?.shipping
                ? money(priced.shipping)
                : delivery === 'shipping'
                  ? 'Choose a region'
                  : ''}
            </dd>
            {priced && toCents(priced.tax) > 0 ? (
              <>
                <dt>Tax</dt>
                <dd>{money(priced.tax)}</dd>
              </>
            ) : null}
            <dt className="grand">Total (FJD)</dt>
            <dd className="grand">{priced ? money(priced.total) : ''}</dd>
          </dl>
          {payment === 'paypal' && priced?.paypal ? (
            <p className="hint">
              PayPal will charge {priced.paypal.currency} {priced.paypal.amount} (rate{' '}
              {priced.paypal.rate} per FJD).
            </p>
          ) : null}
          {priced && !priced.ok ? (
            <p className="line-problem">
              Some items need attention. <Link href="/cart">Go back to your cart</Link>.
            </p>
          ) : null}
          <button
            className="btn btn-block"
            type="submit"
            disabled={sending || loading || !priced?.ok || (delivery === 'shipping' && !regionId)}
          >
            {sending
              ? 'Placing order'
              : payment === 'paypal'
                ? 'Continue to PayPal'
                : 'Place order'}
          </button>
          {delivery === 'shipping' && !regionId ? (
            <p className="hint">Choose a delivery region to see the total.</p>
          ) : null}
        </div>
      </aside>
    </form>
  );
}
