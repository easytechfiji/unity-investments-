'use client';

import type { MenuCategory } from '@od/shared';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { CloseIcon, MenuIcon } from './icons';

/** Small screens: a "Menu" button that opens a full height list of categories. */
export function MobileMenu({ menu }: { menu: MenuCategory[] }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const closeButton = useRef<HTMLButtonElement>(null);
  const openButton = useRef<HTMLButtonElement>(null);

  // Close when the page changes. Adjusting state during render is React's
  // recommended pattern here, instead of an effect.
  const [shownFor, setShownFor] = useState(pathname);
  if (shownFor !== pathname) {
    setShownFor(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const opener = openButton.current;
    closeButton.current?.focus();
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', onKey);
      opener?.focus();
    };
  }, [open]);

  return (
    <>
      <button
        ref={openButton}
        type="button"
        className="header-link menu-toggle"
        aria-expanded={open}
        aria-controls="mobile-menu"
        onClick={() => setOpen(true)}
      >
        <MenuIcon />
        Menu
      </button>
      {open ? (
        <div
          id="mobile-menu"
          className="mobile-menu"
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
        >
          <div className="mobile-menu-head">
            <strong>Categories</strong>
            <button
              ref={closeButton}
              type="button"
              className="header-link"
              onClick={() => setOpen(false)}
            >
              <CloseIcon />
              Close
            </button>
          </div>
          <nav aria-label="Product categories">
            <ul>
              {menu.map((category) => (
                <li key={category.id}>
                  <Link className="top-link" href={`/collection/${category.slug}`}>
                    {category.name}
                  </Link>
                  <ul>
                    {category.subcategories.map((sub) => (
                      <li key={sub.id}>
                        <Link href={`/collection/${category.slug}/${sub.slug}`}>{sub.name}</Link>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
              <li>
                <Link className="top-link" href="/delivery">
                  Delivery and pickup
                </Link>
              </li>
              <li>
                <Link className="top-link" href="/contact_us">
                  Contact us
                </Link>
              </li>
              <li>
                <Link className="top-link" href="/order-lookup">
                  Check an order
                </Link>
              </li>
            </ul>
          </nav>
        </div>
      ) : null}
    </>
  );
}
