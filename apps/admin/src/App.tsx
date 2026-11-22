import { BrowserRouter, Route, Routes, useParams } from 'react-router';
import { Layout } from './Layout';
import { Audit, Admins } from './pages/Audit';
import { Dashboard } from './pages/Dashboard';
import { Login } from './pages/Login';
import { OrderDetail, Orders } from './pages/Orders';
import { ProductEdit, ProductImport, Products } from './pages/Products';
import { ResourceEdit, ResourceList } from './pages/Resource';
import { Settings } from './pages/Settings';
import { SessionProvider, useSession } from './session';

// A fresh form for every resource and id, so no stale values carry over.
function ResourceEditPage() {
  const { resource, id } = useParams();
  return <ResourceEdit key={`${resource}/${id}`} />;
}

function Routed() {
  const { admin, loading } = useSession();
  if (loading) return <p className="login">Loading.</p>;
  if (!admin) return <Login />;
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="orders" element={<Orders />} />
        <Route path="orders/:id" element={<OrderDetail />} />
        <Route path="products" element={<Products />} />
        <Route path="products/import" element={<ProductImport />} />
        <Route path="products/:id" element={<ProductEdit />} />
        <Route path="r/:resource" element={<ResourceList />} />
        <Route path="r/:resource/:id" element={<ResourceEditPage />} />
        <Route path="settings" element={<Settings />} />
        <Route path="audit" element={<Audit />} />
        <Route path="admins" element={<Admins />} />
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
