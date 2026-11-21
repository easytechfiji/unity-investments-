import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { api, ApiError } from '../api';
import {
  ConfirmButton,
  Field,
  Thumb,
  asText,
  toPayload,
  type FieldDef,
  type Values,
} from '../components';
import { RESOURCE_PAGES, type ResourcePage } from '../resources';

type Row = Values & { id: number; image_url?: string | null; deleted_at?: string | null };

function usePage(): ResourcePage | undefined {
  const { resource } = useParams();
  return RESOURCE_PAGES.find((page) => page.key === resource);
}

/** Loads select options that come from another list, such as categories for a subcategory. */
function useOptions(page: ResourcePage | undefined) {
  const [options, setOptions] = useState<Record<string, { value: number; label: string }[]>>({});
  useEffect(() => {
    if (!page?.optionsFrom) return;
    for (const [field, source] of Object.entries(page.optionsFrom)) {
      void api.get<Values[]>(source.path).then((rows) =>
        setOptions((current) => ({
          ...current,
          [field]: rows.map((row) => ({
            value: Number(row[source.value]),
            label: String(row[source.label]),
          })),
        })),
      );
    }
  }, [page]);
  return options;
}

function display(
  value: unknown,
  field: string,
  options: Record<string, { value: number; label: string }[]>,
): string {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  const list = options[field];
  if (list) return list.find((option) => option.value === value)?.label ?? asText(value);
  return asText(value);
}

export function ResourceList() {
  const page = usePage();
  const options = useOptions(page);
  const [rows, setRows] = useState<Row[]>([]);
  const [trash, setTrash] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!page) return;
    api
      .get<Row[]>(`/${page.key}${trash ? '?trash=1' : ''}`)
      .then((found) => {
        setRows(found);
        setError(null);
      })
      .catch((caught: unknown) =>
        setError(caught instanceof ApiError ? caught.message : 'Could not load.'),
      );
  }, [page, trash]);

  if (!page) return <p>Not found.</p>;

  return (
    <>
      <div className="row">
        <h1>{page.title}</h1>
      </div>
      {page.intro ? <p className="muted">{page.intro}</p> : null}
      <p className="row">
        <Link className="btn" to={`/r/${page.key}/new`}>
          Add {page.singular}
        </Link>
        {page.softDelete ? (
          <button
            className="btn btn-plain"
            type="button"
            onClick={() => setTrash((value) => !value)}
          >
            {trash ? 'Back to the list' : 'Show trash'}
          </button>
        ) : null}
      </p>
      {error ? <p className="alert">{error}</p> : null}
      <table className="list">
        <thead>
          <tr>
            {page.image ? <th scope="col">Image</th> : null}
            {page.columns.map((column) => (
              <th key={column.name} scope="col">
                {column.label}
              </th>
            ))}
            <th scope="col">
              <span className="visually-hidden">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              {page.image ? (
                <td>
                  <Thumb src={row.image_url} />
                </td>
              ) : null}
              {page.columns.map((column, index) => (
                <td key={column.name}>
                  {index === 0 && !trash ? (
                    <Link to={`/r/${page.key}/${row.id}`}>
                      {display(row[column.name], column.name, options) || '(no name)'}
                    </Link>
                  ) : (
                    display(row[column.name], column.name, options)
                  )}
                </td>
              ))}
              <td>
                {trash ? (
                  <button
                    className="btn btn-plain"
                    type="button"
                    onClick={() => {
                      void api
                        .post(`/${page.key}/${row.id}/restore`)
                        .then(() =>
                          setRows((current) => current.filter((item) => item.id !== row.id)),
                        );
                    }}
                  >
                    Restore
                  </button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 ? <p className="muted">Nothing here yet.</p> : null}
    </>
  );
}

function emptyValues(fields: FieldDef[]): Values {
  const values: Values = {};
  for (const field of fields)
    values[field.name] =
      field.type === 'checkbox' ? field.name === 'status' : field.type === 'number' ? 0 : '';
  return values;
}

export function ResourceEdit() {
  const page = usePage();
  const { id } = useParams();
  const navigate = useNavigate();
  const options = useOptions(page);
  const isNew = id === 'new';
  const [values, setValues] = useState<Values>(() =>
    isNew && page ? emptyValues(page.fields) : {},
  );
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const fields = useMemo(
    () =>
      (page?.fields ?? []).map((field) =>
        options[field.name] ? { ...field, options: options[field.name] } : field,
      ),
    [page, options],
  );

  useEffect(() => {
    if (!page || isNew) return;
    void api.get<Row>(`/${page.key}/${id}`).then((row) => {
      setValues(row);
      setImageUrl(row.image_url ?? null);
    });
  }, [page, id, isNew]);

  if (!page) return <p>Not found.</p>;

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!page) return;
    setErrors({});
    setMessage(null);
    try {
      const payload = toPayload(page.fields, values);
      if (isNew) {
        const created = await api.post<Row>(`/${page.key}`, payload);
        void navigate(`/r/${page.key}/${created.id}`, { replace: true });
        setMessage({ ok: true, text: 'Saved.' });
      } else {
        await api.put(`/${page.key}/${id}`, payload);
        setMessage({ ok: true, text: 'Saved. The website shows the change within a minute.' });
      }
    } catch (caught) {
      if (caught instanceof ApiError) {
        setErrors(caught.fields);
        setMessage({ ok: false, text: caught.message });
      } else throw caught;
    }
  }

  async function upload(file: File) {
    if (!page) return;
    const form = new FormData();
    form.append('file', file);
    try {
      const result = await api.upload<{ image_url: string | null }>(
        `/${page.key}/${id}/image`,
        form,
      );
      setImageUrl(result.image_url);
      setMessage({ ok: true, text: 'Image uploaded.' });
    } catch (caught) {
      setMessage({
        ok: false,
        text: caught instanceof ApiError ? caught.message : 'Upload failed.',
      });
    }
  }

  return (
    <>
      <p>
        <Link to={`/r/${page.key}`}>Back to {page.title.toLowerCase()}</Link>
      </p>
      <h1>{isNew ? `Add ${page.singular}` : `Edit ${page.singular}`}</h1>
      {message ? (
        <p className={message.ok ? 'notice' : 'alert'} role="status">
          {message.text}
        </p>
      ) : null}
      <form className="form" onSubmit={(event) => void save(event)} noValidate>
        {fields.map((field) => (
          <Field
            key={field.name}
            def={field}
            value={values[field.name]}
            error={errors[field.name]}
            onChange={(value) => setValues((current) => ({ ...current, [field.name]: value }))}
          />
        ))}
        <p className="row">
          <button className="btn" type="submit">
            Save
          </button>
          {!isNew ? (
            <ConfirmButton
              label={page.softDelete ? 'Move to trash' : 'Delete'}
              confirmLabel={page.softDelete ? 'Yes, move to trash' : 'Yes, delete'}
              onConfirm={async () => {
                try {
                  await api.remove(`/${page.key}/${id}`);
                  void navigate(`/r/${page.key}`);
                } catch (caught) {
                  setMessage({
                    ok: false,
                    text: caught instanceof ApiError ? caught.message : 'Delete failed.',
                  });
                }
              }}
            />
          ) : null}
        </p>
      </form>
      {page.image && !isNew ? (
        <section>
          <h2>Image</h2>
          <p className="row">
            <Thumb src={imageUrl} />
          </p>
          <label htmlFor="image-file">
            Upload a JPG, PNG or WebP photo
            <span className="hint">It is resized and cleaned automatically. Up to 8 MB.</span>
          </label>
          <input
            id="image-file"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) => event.target.files?.[0] && void upload(event.target.files[0])}
          />
        </section>
      ) : null}
    </>
  );
}
