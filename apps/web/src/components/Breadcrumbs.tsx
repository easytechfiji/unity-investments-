import Link from 'next/link';
import { breadcrumbJsonLd } from '../lib/seo';
import { JsonLd } from './JsonLd';

export interface Crumb {
  name: string;
  path: string;
}

/** Visible breadcrumb trail plus the matching BreadcrumbList structured data. */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  const all = [{ name: 'Home', path: '/' }, ...items];
  return (
    <>
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <ol>
          {all.map((item, index) => (
            <li key={item.path}>
              {index === all.length - 1 ? (
                <span aria-current="page">{item.name}</span>
              ) : (
                <Link href={item.path}>{item.name}</Link>
              )}
            </li>
          ))}
        </ol>
      </nav>
      <JsonLd data={breadcrumbJsonLd(all)} />
    </>
  );
}
