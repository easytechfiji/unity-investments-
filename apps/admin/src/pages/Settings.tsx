import { useEffect, useState } from 'react';
import { api, ApiError, formatDate } from '../api';
import { Field, asText, type FieldDef, type Values } from '../components';

const SHOP: FieldDef[] = [
  { name: 'site_name', label: 'Shop name', type: 'text', required: true },
  {
    name: 'address',
    label: 'Address',
    type: 'text',
    hint: 'Written the same way as on Google Business Profile and Facebook.',
  },
  { name: 'phone', label: 'Phone', type: 'text' },
  { name: 'phone_2', label: 'Second phone', type: 'text' },
  {
    name: 'email',
    label: 'Shop email',
    type: 'text',
    hint: 'Order notifications and website enquiries go here.',
  },
  { name: 'whatsapp', label: 'WhatsApp number', type: 'text' },
  {
    name: 'opening_hours',
    label: 'Opening hours',
    type: 'text',
    hint: 'For example Mon to Fri 8am to 5pm, Sat 8am to 12pm. Leave empty to hide.',
  },
  { name: 'facebook_url', label: 'Facebook page link', type: 'text' },
  { name: 'instagram_url', label: 'Instagram link', type: 'text' },
];

const BANK: FieldDef[] = [
  { name: 'bank_account_name', label: 'Account name', type: 'text' },
  { name: 'bank_name', label: 'Bank', type: 'text' },
  { name: 'bank_branch_code', label: 'Branch or BSB code', type: 'text' },
  { name: 'bank_account_number', label: 'Account number', type: 'text' },
];

export function Settings() {
  const [values, setValues] = useState<Values | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    void api.get<Values>('/settings').then((data) => {
      const ends = typeof data.sale_ends_at === 'string' ? new Date(data.sale_ends_at) : null;
      // datetime-local wants local time without a zone.
      const local = ends
        ? new Date(ends.getTime() - ends.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
        : '';
      setValues({ ...data, sale_ends_at: local });
    });
  }, []);

  if (!values) return <p>Loading.</p>;

  const field = (def: FieldDef) => (
    <Field
      key={def.name}
      def={def}
      value={values[def.name]}
      error={errors[def.name]}
      onChange={(value) => setValues((current) => ({ ...current, [def.name]: value }))}
    />
  );

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!values) return;
    setErrors({});
    setMessage(null);
    const text = (name: string) => asText(values[name]);
    const ends = text('sale_ends_at');
    try {
      await api.put('/settings', {
        ...Object.fromEntries([...SHOP, ...BANK].map((def) => [def.name, text(def.name)])),
        paypal_fx_rate: text('paypal_fx_rate'),
        sale_active: Boolean(values.sale_active),
        sale_ends_at: ends ? new Date(ends).toISOString() : '',
      });
      setMessage({ ok: true, text: 'Settings saved.' });
    } catch (caught) {
      if (caught instanceof ApiError) {
        setErrors(caught.fields);
        setMessage({ ok: false, text: caught.message });
      } else throw caught;
    }
  }

  return (
    <>
      <h1>Settings</h1>
      {message ? (
        <p className={message.ok ? 'notice' : 'alert'} role="status">
          {message.text}
        </p>
      ) : null}
      <form className="form" onSubmit={(event) => void save(event)} noValidate>
        <h2>Shop details</h2>
        <p className="muted">Shown in the website header, footer, contact page and emails.</p>
        <div className="grid2">{SHOP.map(field)}</div>

        <h2>Bank transfer details</h2>
        <p className="muted">
          Shown to customers who choose bank transfer, on the order confirmation page, in their
          email and on the invoice. Never shown anywhere else on the website.
        </p>
        <div className="grid2">{BANK.map(field)}</div>

        <h2>PayPal</h2>
        {values.paypal_configured ? (
          <>
            <p className="muted">
              PayPal cannot charge Fijian dollars, so it charges {String(values.paypal_currency)}.
              Enter how many {String(values.paypal_currency)} one Fijian dollar buys. Customers see
              the converted amount before they pay. Leave empty to hide PayPal.
            </p>
            {field({
              name: 'paypal_fx_rate',
              label: `${String(values.paypal_currency)} per 1 FJD`,
              type: 'text',
              hint: 'For example 0.44. Check it regularly.',
            })}
          </>
        ) : (
          <p className="muted">
            PayPal is not set up on the server yet, so only bank transfer is offered.
          </p>
        )}

        <h2>Sale</h2>
        <p className="muted">
          When the sale is on and has not ended, products with a sale price show it, with the
          regular price struck through.
        </p>
        {field({ name: 'sale_active', label: 'Sale is on', type: 'checkbox' })}
        {field({
          name: 'sale_ends_at',
          label: 'Sale ends',
          type: 'datetime',
          hint: values.sale_ends_at
            ? `Currently ${formatDate(new Date(asText(values.sale_ends_at)).toISOString())}`
            : undefined,
        })}

        <p>
          <button className="btn" type="submit">
            Save settings
          </button>
        </p>
      </form>
    </>
  );
}
