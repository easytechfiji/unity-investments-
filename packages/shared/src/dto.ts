// Shapes of the JSON the API returns. Prices are decimal strings such as "12.50"
// in FJD unless a field says otherwise.

export interface ImageSet {
  /** Medium size, for the src attribute. */
  src: string;
  /** All sizes, for the srcset attribute. */
  srcSet: string;
}

export interface CategorySummary {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  image: ImageSet | null;
}

export interface SubcategorySummary extends CategorySummary {
  categoryId: number;
  categorySlug: string;
  categoryName: string;
}

export type StockStatus = 'in_stock' | 'low_stock' | 'out_of_stock';

/** in_stock: on the shelf, can be bought. arriving_soon: on its way, quotation only. */
export type Availability = 'in_stock' | 'arriving_soon';

export interface ProductCard {
  id: number;
  name: string;
  slug: string;
  sku: string | null;
  type: 'simple' | 'variable';
  /** Price to pay now: sale price when on sale, otherwise the regular price. Null means "request a quote". */
  price: string | null;
  /** Regular price, set only when a sale price is showing. */
  wasPrice: string | null;
  /** Highest variant price, set only when variants differ in price. */
  priceMax: string | null;
  availability: Availability;
  /** Always 0 for a product arriving soon. */
  stock: number;
  stockStatus: StockStatus;
  image: ImageSet | null;
  categorySlug: string;
  subcategorySlug: string;
  url: string;
}

export interface ProductVariant {
  id: number;
  sku: string | null;
  colour: string | null;
  size: string | null;
  price: string;
  stock: number;
}

export interface ProductVideo {
  id: number;
  title: string;
  description: string | null;
  url: string;
  poster: ImageSet | null;
  aspect: '1x1' | '4x5' | '9x16' | '16x9';
  durationSeconds: number;
  transcript: string | null;
  uploadedAt: string;
}

export interface ProductDetail extends ProductCard {
  smallDescription: string | null;
  /** Sanitised HTML. */
  description: string | null;
  /** Sanitised HTML. */
  buyersGuide: string | null;
  categoryName: string;
  subcategoryName: string;
  gallery: ImageSet[];
  variants: ProductVariant[];
  videos: ProductVideo[];
  /** A fixed list of sizes the enquiry form should ask a visitor to choose from. */
  quoteSizeOptions: string[] | null;
  metaTitle: string | null;
  metaDescription: string | null;
  updatedAt: string;
  related: ProductCard[];
}

/** The two display products shown in their own section on the home page. */
export interface SpotlightProduct {
  id: number;
  name: string;
  slug: string;
  url: string;
  smallDescription: string | null;
  image: ImageSet | null;
  /** The product's first video, shown playing on the home page itself. Null when it has none. */
  video: ProductVideo | null;
}

export interface ProductListResult {
  products: ProductCard[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  priceRange: { min: string; max: string } | null;
}

export interface CategoryPage {
  category: CategorySummary & { metaTitle: string | null; metaDescription: string | null };
  subcategories: SubcategorySummary[];
}

export interface SubcategoryPage {
  subcategory: SubcategorySummary & { metaTitle: string | null; metaDescription: string | null };
  siblings: SubcategorySummary[];
}

export interface Banner {
  id: number;
  name: string | null;
  description: string | null;
  link: string | null;
  image: ImageSet;
}

export interface SiteInfo {
  siteName: string;
  phone: string | null;
  phone2: string | null;
  email: string | null;
  address: string | null;
  openingHours: string | null;
  facebookUrl: string | null;
  instagramUrl: string | null;
  whatsapp: string | null;
  currency: string;
  paypalAvailable: boolean;
  paypalClientId: string | null;
  paypalCurrency: string | null;
  turnstileSiteKey: string | null;
}

export interface HomeData {
  banners: Banner[];
  categories: CategorySummary[];
  newProducts: ProductCard[];
  featured: ProductCard[];
  /** The owner's spotlighted products, shown in their own section, in sort_rank order. */
  spotlight: SpotlightProduct[];
  /** The full catalogue, 12 products, in the Recommended order, for the "All products" teaser. */
  recommended: ProductCard[];
  rows: { category: CategorySummary; products: ProductCard[] }[];
}

export interface ShippingRegion {
  id: number;
  name: string;
  description: string | null;
  price: string;
}

export interface Faq {
  id: number;
  question: string;
  answer: string;
}

export interface ContentPage {
  kind: string;
  name: string;
  slug: string;
  /** Sanitised HTML. */
  body: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  updatedAt: string;
}

export interface MenuCategory {
  id: number;
  name: string;
  slug: string;
  subcategories: { id: number; name: string; slug: string }[];
}

export interface SitemapEntry {
  path: string;
  updatedAt: string;
}

// Cart and checkout --------------------------------------------------------

export type LineProblem =
  | 'not_found'
  | 'unavailable'
  | 'choose_variant'
  | 'variant_not_found'
  | 'quote_only'
  | 'arriving_soon'
  | 'out_of_stock'
  | 'not_enough_stock';

export interface PricedLine {
  productId: number;
  variantId: number | null;
  name: string;
  variantLabel: string | null;
  sku: string | null;
  url: string | null;
  image: ImageSet | null;
  unitPrice: string | null;
  quantity: number;
  lineTotal: string | null;
  available: number;
  problem: LineProblem | null;
}

export interface PricedCart {
  lines: PricedLine[];
  currency: string;
  subtotal: string;
  shipping: string | null;
  tax: string;
  total: string;
  /** What PayPal would charge, when it charges another currency. */
  paypal: { currency: string; amount: string; rate: string } | null;
  ok: boolean;
}

export interface BankDetails {
  accountName: string | null;
  bankName: string | null;
  branchCode: string | null;
  accountNumber: string | null;
}

export interface OrderSummary {
  reference: string;
  orderNumber: string;
  createdAt: string;
  email: string;
  name: string;
  deliveryMethod: 'click_and_collect' | 'shipping';
  shippingRegion: string | null;
  address: string | null;
  paymentMethod: 'bank_transfer' | 'paypal';
  paymentState: 'awaiting' | 'paid' | 'failed' | 'refunded';
  orderState: 'pending' | 'processing' | 'completed' | 'cancelled';
  currency: string;
  subtotal: string;
  shipping: string;
  tax: string;
  total: string;
  charge: { currency: string; amount: string; rate: string } | null;
  items: {
    name: string;
    sku: string | null;
    variant: string | null;
    unitPrice: string;
    quantity: number;
    lineTotal: string;
  }[];
  bankDetails: BankDetails | null;
}

export interface CreatedOrder {
  reference: string;
  orderNumber: string;
  total: string;
  paymentMethod: 'bank_transfer' | 'paypal';
  paypalOrderId: string | null;
}
