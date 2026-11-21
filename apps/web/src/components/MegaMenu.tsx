'use client';

import type { MenuCategory } from '@od/shared';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ChevronIcon } from './icons';

/** "All categories": every category with its subcategories in text columns. */
export function MegaMenu({ menu }: { menu: MenuCategory[] }) {
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();

  // Close when the page changes. Adjusting state during render is React's
  // recommended pattern here, instead of an effect.
  const [shownFor, setShownFor] = useState(pathname);
  if (shownFor !== pathname) {
    setShownFor(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        button.current?.focus();
      }
    };
    const onClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!panel.current?.contains(target) && !button.current?.contains(target)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  return (
    <>
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls="all-categories"
        onClick={() => setOpen((value) => !value)}
      >
        All categories
        <ChevronIcon className="icon icon-after" />
      </button>
      <div ref={panel} id="all-categories" className="megamenu" hidden={!open}>
        {menu.map((category) => (
          <section key={category.id}>
            <h2>
              <Link href={`/collection/${category.slug}`}>{category.name}</Link>
            </h2>
            <ul>
              {category.subcategories.map((sub) => (
                <li key={sub.id}>
                  <Link href={`/collection/${category.slug}/${sub.slug}`}>{sub.name}</Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
        <p>
          <Link href="/collection">See every category</Link>
        </p>
      </div>
    </>
  );
}
