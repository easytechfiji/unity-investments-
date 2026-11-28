// The admin's menu: a few main tabs in the sidebar, each with sub-tabs shown as
// a row at the top of the page. The address says where you are, for example
// /sales/orders or /products/categories.

export interface SubTab {
  label: string;
  to: string;
  /** Only the owner sees it. */
  ownerOnly?: boolean;
  /**
   * Addresses under `to` that belong to a different sub-tab, so this one is not
   * marked as current there (All products is /products, but /products/categories
   * is Categories).
   */
  exact?: boolean;
}

export interface Section {
  label: string;
  /** Where the main tab goes. */
  to: string;
  /** Address prefixes that belong to this section. */
  prefixes: string[];
  tabs: SubTab[];
}

export const SECTIONS: Section[] = [
  { label: 'Dashboard', to: '/', prefixes: [], tabs: [] },
  {
    label: 'Sales',
    to: '/sales/orders',
    prefixes: ['/sales'],
    tabs: [
      { label: 'Orders', to: '/sales/orders' },
      { label: 'Documents', to: '/sales/documents' },
      { label: 'Parties', to: '/sales/parties' },
    ],
  },
  {
    label: 'Products',
    to: '/products',
    prefixes: ['/products'],
    tabs: [
      { label: 'All products', to: '/products', exact: true },
      { label: 'Add product', to: '/products/new', exact: true },
      { label: 'Categories', to: '/products/categories' },
      { label: 'Subcategories', to: '/products/subcategories' },
      { label: 'Sizes and colours', to: '/products/sizes-and-colours' },
      { label: 'Import and export', to: '/products/import', exact: true },
    ],
  },
  {
    label: 'Website',
    to: '/website/banner',
    prefixes: ['/website'],
    tabs: [
      { label: 'Home page banner', to: '/website/banner' },
      { label: 'Pages', to: '/website/pages' },
      { label: 'FAQs', to: '/website/faqs' },
      { label: 'Testimonials', to: '/website/testimonials' },
      { label: 'Redirects', to: '/website/redirects' },
    ],
  },
  {
    label: 'Settings',
    to: '/settings',
    prefixes: ['/settings'],
    tabs: [
      { label: 'Shop details and bank', to: '/settings/shop', ownerOnly: true },
      { label: 'Document settings', to: '/settings/documents', ownerOnly: true },
      { label: 'Delivery regions', to: '/settings/delivery-regions' },
      { label: 'Admin users', to: '/settings/admins', ownerOnly: true },
      { label: 'Activity log', to: '/settings/activity' },
    ],
  },
];

const under = (path: string, prefix: string) => path === prefix || path.startsWith(`${prefix}/`);

/** The main tab an address belongs to. Anything unknown counts as Dashboard. */
export function sectionFor(path: string): Section {
  return (
    SECTIONS.find((section) => section.prefixes.some((prefix) => under(path, prefix))) ??
    SECTIONS[0]!
  );
}

/**
 * The sub-tab an address belongs to: the longest matching one, so
 * /products/categories/4 is Categories, and /products/12 (a product) is All products.
 */
export function subTabFor(section: Section, path: string, owner: boolean): SubTab | undefined {
  const visible = section.tabs.filter((tab) => owner || !tab.ownerOnly);
  const matches = visible
    .filter((tab) => (tab.exact ? path === tab.to : under(path, tab.to)))
    .sort((a, b) => b.to.length - a.to.length);
  if (matches[0]) return matches[0];
  // A product's own page (/products/12) sits under All products.
  return visible.find((tab) => tab.exact && tab.to === section.to);
}

/** The tabs a person may see in a section. */
export function visibleTabs(section: Section, owner: boolean): SubTab[] {
  return section.tabs.filter((tab) => owner || !tab.ownerOnly);
}
