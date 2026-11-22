import { NavLink, Outlet } from 'react-router';
import { RESOURCE_PAGES } from './resources';
import { useSession } from './session';

export function Layout() {
  const { admin, signOut } = useSession();
  const owner = admin?.role === 'owner';
  return (
    <div className="shell">
      <nav className="side" aria-label="Admin">
        <div className="brand">
          <img src="/logo-96.webp" width={36} height={36} alt="" />
          Shop admin
        </div>
        <NavLink to="/" end>
          Dashboard
        </NavLink>
        <NavLink to="/orders">Orders</NavLink>
        <NavLink to="/products">Products</NavLink>
        <NavLink to="/products/import">Import and export</NavLink>
        <div className="group">Catalogue</div>
        {RESOURCE_PAGES.filter((page) => page.group === 'catalogue').map((page) => (
          <NavLink key={page.key} to={`/r/${page.key}`}>
            {page.title}
          </NavLink>
        ))}
        <div className="group">Website</div>
        {RESOURCE_PAGES.filter((page) => page.group === 'website').map((page) => (
          <NavLink key={page.key} to={`/r/${page.key}`}>
            {page.title}
          </NavLink>
        ))}
        <div className="group">Shop</div>
        {owner ? <NavLink to="/settings">Settings and bank details</NavLink> : null}
        <NavLink to="/audit">Activity log</NavLink>
        {owner ? <NavLink to="/admins">Admin users</NavLink> : null}
      </nav>
      <div className="content">
        <div className="topbar">
          <span>
            Signed in as {admin?.name} ({admin?.role})
          </span>
          <button className="btn btn-plain" type="button" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
        <main>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
