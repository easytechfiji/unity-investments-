import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router';
import { Layout } from './Layout';
import { Audit, Admins } from './pages/Audit';
import { Dashboard } from './pages/Dashboard';
import {
  DocumentNew,
  Documents,
  DocumentSettings,
  DocumentView,
  Parties,
  PartyEdit,
} from './pages/Documents';
import { Login } from './pages/Login';
import { OrderDetail, Orders } from './pages/Orders';
import { ProductEdit, ProductImport, Products } from './pages/Products';
import { ResourceEdit, ResourceList } from './pages/Resource';
import { Settings } from './pages/Settings';
import { RESOURCE_PAGES } from './resources';
import { SessionProvider, useSession } from './session';

// A fresh form for every resource and id, so no stale values carry over.
function ResourceEditPage({ resource }: { resource: string }) {
  const { id } = useParams();
  return <ResourceEdit key={`${resource}/${id}`} resource={resource} />;
}

// Old addresses (before the tabs) keep working: each sends you to its new place.
function OldOrder() {
  const { id } = useParams();
  return <Navigate to={`/sales/orders/${id}`} replace />;
}

function OldResource() {
  const { resource, id } = useParams();
  const page = RESOURCE_PAGES.find((item) => item.key === resource);
  if (!page) return <p>Page not found.</p>;
  return <Navigate to={id ? `${page.path}/${id}` : page.path} replace />;
}

function Routed() {
  const { admin, loading } = useSession();
  if (loading) return <p className="login">Loading.</p>;
  if (!admin) return <Login />;
  const owner = admin.role === 'owner';
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />

        <Route path="sales" element={<Navigate to="/sales/orders" replace />} />
        <Route path="sales/orders" element={<Orders />} />
        <Route path="sales/orders/:id" element={<OrderDetail />} />
        <Route path="sales/documents" element={<Documents />} />
        <Route path="sales/documents/new" element={<DocumentNew />} />
        <Route path="sales/documents/:id" element={<DocumentView />} />
        <Route path="sales/parties" element={<Parties />} />
        <Route path="sales/parties/:id" element={<PartyEdit />} />

        <Route path="products" element={<Products />} />
        <Route path="products/import" element={<ProductImport />} />
        <Route path="products/:id" element={<ProductEdit />} />

        <Route path="website" element={<Navigate to="/website/banner" replace />} />

        <Route
          path="settings"
          element={
            <Navigate to={owner ? '/settings/shop' : '/settings/delivery-regions'} replace />
          }
        />
        <Route path="settings/shop" element={<Settings />} />
        <Route path="settings/documents" element={<DocumentSettings />} />
        <Route path="settings/activity" element={<Audit />} />
        <Route path="settings/admins" element={<Admins />} />

        {/* Plain list and form pages: categories, FAQs, delivery regions and the rest. */}
        {RESOURCE_PAGES.flatMap((page) => [
          <Route
            key={page.key}
            path={page.path.slice(1)}
            element={<ResourceList key={page.key} resource={page.key} />}
          />,
          <Route
            key={`${page.key}/edit`}
            path={`${page.path.slice(1)}/:id`}
            element={<ResourceEditPage resource={page.key} />}
          />,
        ])}

        <Route path="orders" element={<Navigate to="/sales/orders" replace />} />
        <Route path="orders/:id" element={<OldOrder />} />
        <Route path="r/:resource" element={<OldResource />} />
        <Route path="r/:resource/:id" element={<OldResource />} />
        <Route path="audit" element={<Navigate to="/settings/activity" replace />} />
        <Route path="admins" element={<Navigate to="/settings/admins" replace />} />

        <Route path="*" element={<p>Page not found.</p>} />
      </Route>
    </Routes>
  );
}

export function App() {
  return (
    <SessionProvider>
      <BrowserRouter>
        <Routed />
      </BrowserRouter>
    </SessionProvider>
  );
}
