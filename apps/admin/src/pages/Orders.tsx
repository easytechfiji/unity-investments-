import { formatPrice, toCents, type OrderSummary } from '@od/shared';
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { api, ApiError, formatDate } from '../api';
import { Badge, ConfirmButton } from '../components';

interface OrderRow {
  id: number;
  order_number: string;
  created_at: string;
  first_name: string;
  last_name: string | null;
  email: string;
  total: string;
  payment_method: string;
  payment_state: string;
  order_state: string;
  delivery_method: string;
  shipping_region: string | null;
}

export function Orders() {
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState<{
    orders: OrderRow[];
    total: number;
    page: number;
    pageSize: number;
  } | null>(null);
  const [search, setSearch] = useState(params.get('q') ?? '');

  useEffect(() => {
    void api.get<typeof data>(`/orders?${params.toString()}`).then(setData);
  }, [params]);

  const set = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete('page');
    setParams(next);
  };

  const page = Number(params.get('page') ?? '1');
  return (
    <>
      <h1>Orders</h1>
      <form
        className="row"
        onSubmit={(event) => {
          event.preventDefault();
          set('q', search.trim() || null);
        }}
      >
        <label className="visually-hidden" htmlFor="order-search">
          Search orders
        </label>
        <input
          id="order-search"
          type="search"
          placeholder="Order number, name or email"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <button className="btn" type="submit">
          Search
        </button>
        <label className="visually-hidden" htmlFor="order-state">
          Status
        </label>
        <select
          id="order-state"
          value={params.get('state') ?? ''}
          onChange={(event) => set('state', event.target.value || null)}
        >
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="processing">Processing</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <label className="visually-hidden" htmlFor="order-payment">
          Payment
        </label>
        <select
          id="order-payment"
          value={params.get('payment') ?? ''}
          onChange={(event) => set('payment', event.target.value || null)}
        >
          <option value="">All payments</option>
          <option value="awaiting">Awaiting payment</option>
          <option value="paid">Paid</option>
          <option value="failed">Failed</option>
          <option value="refunded">Refunded</option>
        </select>
        <button
          className="btn btn-plain"
          type="button"
          onClick={() => set('trash', params.get('trash') ? null : '1')}
        >
          {params.get('trash') ? 'Back to orders' : 'Show trash'}
        </button>
      </form>
      {!data ? (
        <p>Loading.</p>
      ) : (
        <>
          <p className="muted">{data.total} orders</p>
          <table className="list">
            <thead>
              <tr>
                <th scope="col">Order</th>
                <th scope="col">Placed</th>
                <th scope="col">Customer</th>
                <th scope="col">Delivery</th>
                <th scope="col">Status</th>
                <th scope="col">Payment</th>
                <th scope="col" className="num">
                  Total (FJD)
                </th>
              </tr>
            </thead>
            <tbody>
              {data.orders.map((order) => (
                <tr key={order.id}>
                  <td>
                    <Link to={`/sales/orders/${order.id}`}>{order.order_number}</Link>
                  </td>
                  <td>{formatDate(order.created_at)}</td>
                  <td>
                    {[order.first_name, order.last_name].filter(Boolean).join(' ')}
                    <div className="muted">{order.email}</div>
                  </td>
                  <td>
                    {order.delivery_method === 'shipping'
                      ? order.shipping_region
                      : 'Click And Collect'}
                  </td>
                  <td>
                    <Badge value={order.order_state} />
                  </td>
                  <td>
                    {order.payment_method === 'paypal' ? 'PayPal' : 'Bank'}{' '}
                    <Badge value={order.payment_state} />
                  </td>
                  <td className="num">{formatPrice(toCents(order.total))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="row pager">
            {page > 1 ? (
              <button
                className="btn btn-plain"
                type="button"
                onClick={() =>
                  setParams((current) => {
                    const next = new URLSearchParams(current);
                    next.set('page', String(page - 1));
                    return next;
                  })
                }
              >
                Previous
              </button>
            ) : null}
            {page * data.pageSize < data.total ? (
              <button
                className="btn btn-plain"
                type="button"
                onClick={() =>
                  setParams((current) => {
                    const next = new URLSearchParams(current);
                    next.set('page', String(page + 1));
                    return next;
                  })
                }
              >
                Next
              </button>
            ) : null}
          </p>
        </>
      )}
    </>
  );
}

type OrderDetailData = OrderSummary & {
  id: number;
  phone: string;
  customer_note: string | null;
  payment_reference: string | null;
  paid_at: string | null;
  stock_reserved: boolean;
  deleted_at: string | null;
  ship_phone: string | null;
  allowedStates: string[];
};

const STATE_LABEL: Record<string, string> = {
  processing: 'Mark as being prepared',
  completed: 'Mark as completed',
  cancelled: 'Cancel order',
};

export function OrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState<OrderDetailData | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(() => {
    void api.get<OrderDetailData>(`/orders/${id}`).then(setOrder);
  }, [id]);
  useEffect(load, [load]);

  async function act(work: () => Promise<unknown>, done: string) {
    setMessage(null);
    try {
      await work();
      setMessage({ ok: true, text: done });
      load();
    } catch (caught) {
      setMessage({
        ok: false,
        text: caught instanceof ApiError ? caught.message : 'That did not work.',
      });
    }
  }

  if (!order) return <p>Loading.</p>;
  const money = (value: string) => formatPrice(toCents(value));
  return (
    <>
      <p>
        <Link to="/sales/orders">Back to orders</Link>
      </p>
      <h1>
        Order {order.orderNumber} <Badge value={order.orderState} />{' '}
        <Badge value={order.paymentState} />
      </h1>
      {message ? (
        <p className={message.ok ? 'notice' : 'alert'} role="status">
          {message.text}
        </p>
      ) : null}
      {order.deleted_at ? <p className="alert">This order is in the trash.</p> : null}
      <p className="row">
        {order.paymentMethod === 'bank_transfer' &&
        order.paymentState === 'awaiting' &&
        order.orderState !== 'cancelled' ? (
          <ConfirmButton
            label="Mark as paid"
            confirmLabel="Yes, the money is in our account"
            onConfirm={() =>
              act(
                () => api.post(`/orders/${id}/mark-paid`),
                'Marked as paid. The customer has been emailed.',
              )
            }
          />
        ) : null}
        {order.allowedStates.map((state) =>
          state === 'cancelled' ? (
            <ConfirmButton
              key={state}
              label={STATE_LABEL[state] ?? state}
              confirmLabel="Yes, cancel it"
              onConfirm={() =>
                act(
                  () => api.post(`/orders/${id}/state`, { state }),
                  'Order cancelled and stock returned. The customer has been emailed.',
                )
              }
            />
          ) : (
            <button
              key={state}
              className="btn"
              type="button"
              onClick={() =>
                void act(
                  () => api.post(`/orders/${id}/state`, { state }),
                  'Status changed. The customer has been emailed.',
                )
              }
            >
              {STATE_LABEL[state] ?? state}
            </button>
          ),
        )}
        <button
          className="btn btn-plain"
          type="button"
          onClick={() =>
            void api.download(`/orders/${id}/invoice.pdf`, `invoice-${order.orderNumber}.pdf`)
          }
        >
          Download invoice
        </button>
        {order.deleted_at ? (
          <button
            className="btn btn-plain"
            type="button"
            onClick={() => void act(() => api.post(`/orders/${id}/restore`), 'Restored.')}
          >
            Restore
          </button>
        ) : (
          <ConfirmButton
            label="Move to trash"
            confirmLabel="Yes, move to trash"
            onConfirm={async () => {
              await api.remove(`/orders/${id}`);
              void navigate('/sales/orders');
            }}
          />
        )}
      </p>

      <div className="grid2">
        <section>
          <h2>Customer</h2>
          <p>
            {order.name}
            <br />
            <a href={`mailto:${order.email}`}>{order.email}</a>
            <br />
            <a href={`tel:${order.phone}`}>{order.phone}</a>
          </p>
          {order.customer_note ? (
            <>
              <h2>Customer note</h2>
              <p>{order.customer_note}</p>
            </>
          ) : null}
        </section>
        <section>
          <h2>
            {order.deliveryMethod === 'shipping'
              ? `Delivery, ${order.shippingRegion ?? ''}`
              : 'Click And Collect'}
          </h2>
          {order.address ? <p>{order.address}</p> : null}
          {order.ship_phone ? <p>Recipient phone: {order.ship_phone}</p> : null}
          <h2>Payment</h2>
          <p>
            {order.paymentMethod === 'paypal' ? 'PayPal' : 'Bank transfer'}, {order.paymentState}
            {order.paid_at ? `, paid ${formatDate(order.paid_at)}` : ''}
            {order.payment_reference ? (
              <>
                <br />
                PayPal capture: {order.payment_reference}
              </>
            ) : null}
            {order.charge ? (
              <>
                <br />
                Charged {order.charge.currency} {order.charge.amount} at {order.charge.rate}
              </>
            ) : null}
            <br />
            Stock {order.stock_reserved ? 'taken for this order' : 'not taken'}
          </p>
        </section>
      </div>

      <h2>Items</h2>
      <table className="list">
        <thead>
          <tr>
            <th scope="col">Item</th>
            <th scope="col">SKU</th>
            <th scope="col" className="num">
              Price
            </th>
            <th scope="col" className="num">
              Qty
            </th>
            <th scope="col" className="num">
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((item, index) => (
            <tr key={index}>
              <td>
                {item.name}
                {item.variant ? <div className="muted">{item.variant}</div> : null}
              </td>
              <td>{item.sku}</td>
              <td className="num">{money(item.unitPrice)}</td>
              <td className="num">{item.quantity}</td>
              <td className="num">{money(item.lineTotal)}</td>
            </tr>
          ))}
          <tr>
            <td colSpan={4}>Subtotal</td>
            <td className="num">{money(order.subtotal)}</td>
          </tr>
          <tr>
            <td colSpan={4}>Delivery</td>
            <td className="num">{money(order.shipping)}</td>
          </tr>
          {toCents(order.tax) > 0 ? (
            <tr>
              <td colSpan={4}>Tax</td>
              <td className="num">{money(order.tax)}</td>
            </tr>
          ) : null}
          <tr>
            <th scope="row" colSpan={4}>
              Total (FJD)
            </th>
            <td className="num">
              <strong>{money(order.total)}</strong>
            </td>
          </tr>
        </tbody>
      </table>
      <p className="muted">
        Placed {formatDate(order.createdAt)}. Customer reference {order.reference}.
      </p>
    </>
  );
}
