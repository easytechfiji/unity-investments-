// The storefront URL scheme, kept identical to the old site so Google rankings carry over.

export const categoryPath = (category: string) => `/collection/${category}`;

export const subcategoryPath = (category: string, subcategory: string) =>
  `/collection/${category}/${subcategory}`;

export const productPath = (category: string, subcategory: string, product: string) =>
  `/collection/${category}/${subcategory}/product/${product}`;
