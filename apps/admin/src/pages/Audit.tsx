import { useEffect, useState } from 'react';
import { api, formatDate } from '../api';

interface Entry {
  id: number;
  action: string;
  entity: string;
  entity_id: string | null;
  ip: string | null;
  created_at: string;
  admin_name: string;
}

/** Every change made in the admin. Nobody can edit or delete these entries. */
export function Audit() {
  const [page, setPage] = useState(1);
  const [entries, setEntries] = useState<Entry[]>([]);
  useEffect(() => {
    void api
      .get<{ entries: Entry[] }>(`/audit?page=${page}`)
      .then((data) => setEntries(data.entries));
  }, [page]);
  return (
    <>
      <h1>Activity log</h1>
      <p className="muted">Who changed what and when. This log cannot be edited or deleted.</p>
      <table className="list">
        <thead>
          <tr>
            <th scope="col">When</th>
            <th scope="col">Who</th>
            <th scope="col">Action</th>
            <th scope="col">What</th>
            <th scope="col">From</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id}>
              <td>{formatDate(entry.created_at)}</td>
              <td>{entry.admin_name}</td>
              <td>{entry.action.replace(/_/g, ' ')}</td>
              <td>
                {entry.entity.replace(/_/g, ' ')} {entry.entity_id ?? ''}
              </td>
              <td>{entry.ip}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="row pager">
        {page > 1 ? (
          <button className="btn btn-plain" type="button" onClick={() => setPage(page - 1)}>
            Newer
          </button>
        ) : null}
        {entries.length === 100 ? (
          <button className="btn btn-plain" type="button" onClick={() => setPage(page + 1)}>
            Older
          </button>
        ) : null}
      </p>
    </>
  );
}

export function Admins() {
  const [admins, setAdmins] = useState<
    { user_id: string; name: string; role: string; email: string | null; created_at: string }[]
  >([]);
  useEffect(() => {
    void api.get<typeof admins>('/admins').then(setAdmins);
  }, []);
  return (
    <>
      <h1>Admin users</h1>
      <p className="muted">
        Admin accounts are created by the developer with <code>npm run admin:create</code>. There is
        no sign up page. Every admin must use an authenticator app.
      </p>
      <table className="list">
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col">Email</th>
            <th scope="col">Role</th>
            <th scope="col">Added</th>
          </tr>
        </thead>
        <tbody>
          {admins.map((admin) => (
            <tr key={admin.user_id}>
              <td>{admin.name}</td>
              <td>{admin.email}</td>
              <td>{admin.role}</td>
              <td>{formatDate(admin.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
