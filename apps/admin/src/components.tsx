import { useState, type ReactNode } from 'react';

export type FieldType =
  'text' | 'textarea' | 'html' | 'number' | 'money' | 'checkbox' | 'select' | 'datetime';

export interface FieldDef {
  name: string;
  label: string;
  type: FieldType;
  hint?: string;
  options?: { value: string | number; label: string }[];
  required?: boolean;
}

export type Values = Record<string, unknown>;

/** A value as form text: strings and numbers as they are, anything else empty. */
export function asText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

/** One form field. Errors show next to the field in plain words. */
export function Field({
  def,
  value,
  error,
  onChange,
}: {
  def: FieldDef;
  value: unknown;
  error?: string;
  onChange: (value: unknown) => void;
}) {
  const id = `f-${def.name}`;
  const describedBy = error ? `${id}-error` : undefined;
  const common = { id, 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy };

  if (def.type === 'checkbox') {
    return (
      <div className="field">
        <label className="check">
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(event) => onChange(event.target.checked)}
            {...common}
          />
          {def.label}
        </label>
        {def.hint ? <span className="hint">{def.hint}</span> : null}
        {error ? (
          <p className="error" id={describedBy}>
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  const text = asText(value);
  let input: ReactNode;
  switch (def.type) {
    case 'textarea':
    case 'html':
      input = (
        <textarea
          className={def.type === 'html' ? 'tall' : undefined}
          value={text}
          onChange={(event) => onChange(event.target.value)}
          {...common}
        />
      );
      break;
    case 'select':
      input = (
        <select
          value={text}
          onChange={(event) => onChange(event.target.value === '' ? null : event.target.value)}
          {...common}
        >
          <option value="">Choose</option>
          {def.options?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      );
      break;
    case 'number':
      input = (
        <input
          type="number"
          value={text}
          onChange={(event) => onChange(event.target.value)}
          {...common}
        />
      );
      break;
    case 'money':
      input = (
        <input
          type="text"
          inputMode="decimal"
          value={text}
          placeholder="0.00"
          onChange={(event) => onChange(event.target.value)}
          {...common}
        />
      );
      break;
    case 'datetime':
      input = (
        <input
          type="datetime-local"
          value={text}
          onChange={(event) => onChange(event.target.value)}
          {...common}
        />
      );
      break;
    default:
      input = (
        <input
          type="text"
          value={text}
          onChange={(event) => onChange(event.target.value)}
          {...common}
        />
      );
  }
  return (
    <div className="field">
      <label htmlFor={id}>
        {def.label}
        {def.hint ? <span className="hint">{def.hint}</span> : null}
      </label>
      {input}
      {error ? (
        <p className="error" id={describedBy}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Values as the API expects: numbers for number fields, trimmed money. */
export function toPayload(fields: FieldDef[], values: Values): Values {
  const payload: Values = {};
  for (const def of fields) {
    const value = values[def.name];
    if (def.type === 'checkbox') payload[def.name] = Boolean(value);
    else if (def.type === 'number')
      payload[def.name] = value === '' || value === null || value === undefined ? 0 : Number(value);
    else if (def.type === 'select')
      payload[def.name] =
        value === '' || value === undefined
          ? null
          : /^\d+$/.test(asText(value))
            ? Number(value)
            : value;
    else payload[def.name] = asText(value);
  }
  return payload;
}

/** A delete that needs a second, deliberate click before it happens. */
export function ConfirmButton({
  label,
  confirmLabel,
  onConfirm,
}: {
  label: string;
  confirmLabel: string;
  onConfirm: () => Promise<void>;
}) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!asking) {
    return (
      <button type="button" className="btn btn-plain" onClick={() => setAsking(true)}>
        {label}
      </button>
    );
  }
  return (
    <span className="confirm" role="group" aria-label="Confirm">
      <span>Are you sure?</span>
      <button
        type="button"
        className="btn btn-danger"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void onConfirm().finally(() => {
            setBusy(false);
            setAsking(false);
          });
        }}
      >
        {confirmLabel}
      </button>
      <button type="button" className="btn btn-plain" onClick={() => setAsking(false)}>
        Cancel
      </button>
    </span>
  );
}

export function Badge({ value }: { value: string }) {
  return <span className={`badge badge-${value}`}>{value.replace(/_/g, ' ')}</span>;
}

export function Thumb({ src }: { src: string | null | undefined }) {
  return src ? (
    <img className="thumb" src={src} alt="" />
  ) : (
    <span className="thumb-empty" aria-hidden="true" />
  );
}
