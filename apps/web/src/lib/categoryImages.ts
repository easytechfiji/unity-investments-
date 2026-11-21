// Background photos for the category boxes on the home page, keyed by category
// slug. Files live in public/images/categories. A category with no entry here
// gets a plain coloured box instead.
const CATEGORY_IMAGES: Record<string, string> = {
  'blankets-bedding': '/images/categories/blankets-bedding.webp',
};

export function categoryImage(slug: string): string | null {
  return CATEGORY_IMAGES[slug] ?? null;
}
