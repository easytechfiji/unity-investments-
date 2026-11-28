import { Link, Outlet, useLocation } from 'react-router';
import { SECTIONS, sectionFor, subTabFor, visibleTabs } from './nav';
import { useSession } from './session';

/**
 * The admin frame: main tabs in the sidebar (a bar across the top on small
 * screens) and the current main tab's sub-tabs as a row above the page. Both are
 * real links with aria-current="page" on the one you are on.
 */
export function Layout() {
  const { admin, signOut } = useSession();
  const owner = admin?.role === 'owner';
  const { pathname } = useLocation();
  const section = sectionFor(pathname);
  const tabs = visibleTabs(section, owner);
  const current = subTabFor(section, pathname, owner);

  return (
    <div className="shell">
      <nav className="side" aria-label="Main">
        <div className="brand">
          <img src="/logo-96.webp" width={36} height={36} alt="" />
          Shop admin
        </div>
        <ul className="side-tabs">
          {SECTIONS.map((item) => {
            const active = item === section;
            return (
              <li key={item.label}>
                <Link
                  to={item.to}
                  className={active ? 'active' : undefined}
                  aria-current={active ? 'page' : undefined}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
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
        {tabs.length > 0 ? (
          <nav className="subtabs" aria-label={section.label}>
            <ul>
              {tabs.map((tab) => {
                const active = tab === current;
                return (
                  <li key={tab.to}>
                    <Link
                      to={tab.to}
                      className={active ? 'active' : undefined}
                      aria-current={active ? 'page' : undefined}
                    >
                      {tab.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        ) : null}
        <main>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
