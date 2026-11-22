import { formatPrice, toCents } from '@od/shared';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api, formatDate } from '../api';
import { Badge } from '../components';

interface DashboardData {
  counts: {
    pending: number;
    processing: number;
    awaiting_bank_transfer: number;
    orders_30_days: number;
  };
  revenue: string;
  lowStock: { id: number; name: string; sku: string | null; stock: number }[];
  recent: {
    id: number;
    order_number: string;
    created_at: string;
    first_name: string;
    last_name: string | null;
    total: string;
    payment_state: string;
    order_state: string;
  }[];
  catalogue: { products: number; samples: number };
  missing: string[];
}

export function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  useEffect(() => {
    void api.get<DashboardData>('/dashboard').then(setData);
  }, []);
  if (!data) return <p>Loading.</p>;
  return (
    <>
      <h1>Dashboard</h1>
      {data.missing.length > 0 ? (
        <div className="alert">
          <strong>Still to set up</strong> (Settings and bank details):
          <ul>
            {data.missing.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {data.catalogue.samples > 0 ? (
        <p className="alert">
          {data.catalogue.samples} sample products are still in the catalogue. Remove them before
          launch with <code>npm run db:remove-samples</code>.
        </p>
      ) : null}
      <div className="stats">
        <div>
          <span>New orders</span>
          <strong>{data.counts.pending}</strong>
        </div>
        <div>
          <span>Being prepared</span>
          <strong>{data.counts.processing}</strong>
        </div>
        <div>
          <span>Waiting for bank transfer</span>
          <strong>{data.counts.awaiting_bank_transfer}</strong>
        </div>
        <div>
          <span>Orders, last 30 days</span>
          <strong>{data.counts.orders_30_days}</strong>
        </div>
        <div>
          <span>Paid, last 30 days</span>
          <strong>{formatPrice(toCents(data.revenue))}</strong>
        </div>
      </div>
      <h2>Latest orders</h2>
      <table className="list">
        <thead>
          <tr>
            <th scope="col">Order</th>
            <th scope="col">Placed</th>
            <th scope="col">Customer</th>
            <th scope="col">Status</th>
            <th scope="col">Payment</th>
            <th scope="col" className="num">
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {data.recent.map((order) => (
            <tr key={order.id}>
              <td>
                <Link to={`/orders/${order.id}`}>{order.order_number}</Link>
              </td>
              <td>{formatDate(order.created_at)}</td>
              <td>{[order.first_name, order.last_name].filter(Boolean).join(' ')}</td>
              <td>
                <Badge value={order.order_state} />
              </td>
              <td>
                <Badge value={order.payment_state} />
              </td>
              <td className="num">{formatPrice(toCents(order.total))}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h2>Low stock</h2>
      {data.lowStock.length === 0 ? (
        <p className="muted">Nothing is low.</p>
      ) : (
        <table className="list">
          <thead>
            <tr>
              <th scope="col">Product</th>
              <th scope="col">SKU</th>
              <th scope="col" className="num">
                Stock
              </th>
            </tr>
          </thead>
          <tbody>
            {data.lowStock.map((product) => (
              <tr key={product.id}>
                <td>
                  <Link to={`/products/${product.id}`}>{product.name}</Link>
                </td>
                <td>{product.sku}</td>
                <td className={`num ${product.stock <= 0 ? 'warn' : ''}`}>{product.stock}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
