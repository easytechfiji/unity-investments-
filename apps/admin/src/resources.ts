import type { FieldDef } from './components';

// Admin pages that are a plain list plus a form. Field names are the database
// column names the API accepts for that resource.

export interface ResourcePage {
  key: string;
  title: string;
  singular: string;
  /** Where the page lives in the admin, for example /products/categories. */
  path: string;
  fields: FieldDef[];
  /** Columns shown in the list. */
  columns: { name: string; label: string }[];
  softDelete?: boolean;
  image?: boolean;
  /** Select options loaded from another resource, by field name. */
  optionsFrom?: Record<string, { path: string; value: string; label: string }>;
  intro?: string;
}

const seo: FieldDef[] = [
  {
    name: 'meta_title',
    label: 'Search engine title',
    type: 'text',
    hint: 'About 60 characters. Leave empty to use the name.',
  },
  {
    name: 'meta_description',
    label: 'Search engine description',
    type: 'textarea',
    hint: 'About 155 characters, written for people.',
  },
];

export const RESOURCE_PAGES: ResourcePage[] = [
  {
    key: 'categories',
    title: 'Categories',
    singular: 'category',
    path: '/products/categories',
    softDelete: true,
    image: true,
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true },
      {
        name: 'slug',
        label: 'Web address (slug)',
        type: 'text',
        hint: 'Lowercase words joined by hyphens, for example office-chairs. Changing it breaks old links.',
        required: true,
      },
      {
        name: 'description',
        label: 'Intro text',
        type: 'textarea',
        hint: '60 to 120 words about what is in this range. Shown on the category page.',
      },
      { name: 'sort_order', label: 'Order', type: 'number', hint: 'Lower numbers show first.' },
      { name: 'popular', label: 'Popular', type: 'checkbox' },
      { name: 'status', label: 'Show on the website', type: 'checkbox' },
      ...seo,
    ],
    columns: [
      { name: 'name', label: 'Name' },
      { name: 'slug', label: 'Slug' },
      { name: 'sort_order', label: 'Order' },
      { name: 'status', label: 'Shown' },
    ],
  },
  {
    key: 'subcategories',
    title: 'Subcategories',
    singular: 'subcategory',
    path: '/products/subcategories',
    softDelete: true,
    image: true,
    optionsFrom: { category_id: { path: '/categories', value: 'id', label: 'name' } },
    fields: [
      { name: 'category_id', label: 'Category', type: 'select', required: true },
      { name: 'name', label: 'Name', type: 'text', required: true },
      {
        name: 'slug',
        label: 'Web address (slug)',
        type: 'text',
        hint: 'Lowercase words joined by hyphens. Changing it breaks old links.',
        required: true,
      },
      { name: 'description', label: 'Intro text', type: 'textarea' },
      { name: 'sort_order', label: 'Order', type: 'number' },
      { name: 'popular', label: 'Popular', type: 'checkbox' },
      { name: 'status', label: 'Show on the website', type: 'checkbox' },
      ...seo,
    ],
    columns: [
      { name: 'name', label: 'Name' },
      { name: 'slug', label: 'Slug' },
      { name: 'category_id', label: 'Category' },
      { name: 'status', label: 'Shown' },
    ],
  },
  {
    key: 'attribute-values',
    title: 'Sizes and colours',
    singular: 'size or colour',
    path: '/products/sizes-and-colours',
    optionsFrom: { attribute_id: { path: '/attribute-options', value: 'id', label: 'name' } },
    intro: 'The sizes and colours that product variants can use.',
    fields: [
      { name: 'attribute_id', label: 'Type', type: 'select', required: true },
      {
        name: 'name',
        label: 'Name',
        type: 'text',
        hint: 'For example Large, 1200 mm or Black.',
        required: true,
      },
      { name: 'status', label: 'Available', type: 'checkbox' },
    ],
    columns: [
      { name: 'attribute_id', label: 'Type' },
      { name: 'name', label: 'Name' },
    ],
  },
  {
    key: 'shipping-regions',
    title: 'Delivery regions',
    singular: 'delivery region',
    path: '/settings/delivery-regions',
    intro: 'Delivery areas in Fiji and the charge per order. Click And Collect is always free.',
    fields: [
      { name: 'region_name', label: 'Area name', type: 'text', required: true },
      {
        name: 'description',
        label: 'Note',
        type: 'text',
        hint: 'Optional, shown on the Delivery page.',
      },
      { name: 'price', label: 'Delivery charge (FJD)', type: 'money', required: true },
      { name: 'sort_order', label: 'Order', type: 'number' },
      { name: 'status', label: 'Offer at checkout', type: 'checkbox' },
    ],
    columns: [
      { name: 'region_name', label: 'Area' },
      { name: 'price', label: 'Charge (FJD)' },
      { name: 'status', label: 'Offered' },
    ],
  },
  {
    key: 'banners',
    title: 'Home page banner',
    singular: 'banner',
    path: '/website/banner',
    image: true,
    intro:
      'A real photo from the shop or a product range, shown at the top of the home page. Upload the image after saving.',
    fields: [
      {
        name: 'name',
        label: 'Image description',
        type: 'text',
        hint: 'Describes the photo for people who cannot see it.',
      },
      { name: 'description', label: 'Note', type: 'text' },
      {
        name: 'link',
        label: 'Link',
        type: 'text',
        hint: 'A site path such as /collection/road-safety, or empty.',
      },
      { name: 'sort_order', label: 'Order', type: 'number' },
      { name: 'status', label: 'Show', type: 'checkbox' },
    ],
    columns: [
      { name: 'name', label: 'Description' },
      { name: 'link', label: 'Link' },
      { name: 'status', label: 'Shown' },
    ],
  },
  {
    key: 'faqs',
    title: 'FAQs',
    singular: 'question',
    path: '/website/faqs',
    fields: [
      { name: 'question', label: 'Question', type: 'text', required: true },
      {
        name: 'answer',
        label: 'Answer',
        type: 'textarea',
        hint: 'Plain text. A blank line starts a new paragraph.',
        required: true,
      },
      { name: 'sort_order', label: 'Order', type: 'number' },
      { name: 'status', label: 'Show', type: 'checkbox' },
    ],
    columns: [
      { name: 'question', label: 'Question' },
      { name: 'status', label: 'Shown' },
    ],
  },
  {
    key: 'pages',
    title: 'Pages',
    singular: 'page',
    path: '/website/pages',
    intro:
      'Text for the About, Delivery, Privacy and Terms pages. Without one, the website shows a short plain default.',
    fields: [
      {
        name: 'kind',
        label: 'Which page',
        type: 'select',
        options: [
          { value: 'about', label: 'About us' },
          { value: 'delivery', label: 'Delivery (extra text under the price table)' },
          { value: 'privacy', label: 'Privacy' },
          { value: 'terms', label: 'Terms' },
        ],
        required: true,
      },
      { name: 'name', label: 'Heading', type: 'text', required: true },
      { name: 'slug', label: 'Slug', type: 'text', required: true },
      {
        name: 'body',
        label: 'Text (HTML)',
        type: 'html',
        hint: 'Paragraphs, headings, lists, links and tables. Anything else is removed when saved.',
      },
      { name: 'status', label: 'Show', type: 'checkbox' },
      ...seo,
    ],
    columns: [
      { name: 'kind', label: 'Page' },
      { name: 'name', label: 'Heading' },
    ],
  },
  {
    key: 'testimonials',
    title: 'Testimonials',
    singular: 'testimonial',
    path: '/website/testimonials',
    intro: 'Only add real customer comments, with their permission. Hidden until shown is ticked.',
    fields: [
      { name: 'name', label: 'Customer name', type: 'text', required: true },
      { name: 'body', label: 'What they said', type: 'textarea', required: true },
      { name: 'status', label: 'Show (I have the customer’s permission)', type: 'checkbox' },
    ],
    columns: [
      { name: 'name', label: 'Name' },
      { name: 'status', label: 'Shown' },
    ],
  },
  {
    key: 'redirects',
    title: 'Redirects',
    singular: 'redirect',
    path: '/website/redirects',
    intro:
      'Send an old or renamed address to its new page with a permanent redirect, so links and Google rankings carry over.',
    fields: [
      {
        name: 'from_path',
        label: 'Old address',
        type: 'text',
        hint: 'For example /collection/old-name',
        required: true,
      },
      {
        name: 'to_path',
        label: 'New address',
        type: 'text',
        hint: 'For example /collection/new-name',
        required: true,
      },
    ],
    columns: [
      { name: 'from_path', label: 'From' },
      { name: 'to_path', label: 'To' },
    ],
  },
];
