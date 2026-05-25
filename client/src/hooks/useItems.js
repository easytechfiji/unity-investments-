import { useEffect, useState } from 'react';
import supabase from '../lib/supabase';

const storageBucket = import.meta.env.VITE_SUPABASE_STORAGE_BUCKET || 'item-images';

function toPublicImageUrl(imagePath) {
  if (!imagePath || !supabase) return null;

  const { data } = supabase.storage.from(storageBucket).getPublicUrl(imagePath);
  return data?.publicUrl || null;
}

function mapItem(row) {
  const category = row.categories || {};

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    imageUrl: row.image_url || toPublicImageUrl(row.image_path),
    imagePath: row.image_path,
    categoryId: row.category_id,
    categoryName: category.name,
    categorySlug: category.slug,
    price: row.price,
    tags: row.tags || [],
    createdAt: row.created_at,
  };
}

export default function useItems({ category, page = 1, limit = 12, search = '' } = {}) {
  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(null);

    async function loadItems() {
      if (!supabase) {
        if (!mounted) return;
        setData([]);
        setTotal(0);
        setError(new Error('Supabase is not configured'));
        setLoading(false);
        return;
      }

      const from = (Math.max(page, 1) - 1) * limit;
      const to = from + limit - 1;

      let query = supabase
        .from('items')
        .select(`
          id,
          name,
          description,
          image_path,
          price,
          tags,
          category_id,
          created_at,
          categories!inner (
            id,
            slug,
            name
          )
        `, { count: 'exact' })
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .range(from, to);

      if (category) {
        query = query.eq('categories.slug', category);
      }

      if (search) {
        query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`);
      }

      const { data: items, count, error: itemsError } = await query;

      if (!mounted) return;

      if (itemsError) {
        setError(itemsError);
        setData([]);
        setTotal(0);
      } else {
        setData((items || []).map(mapItem));
        setTotal(count || 0);
      }

      setLoading(false);
    }

    loadItems().catch((err) => {
        if (!mounted) return;
        setError(err);
        setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [category, page, limit, search]);

  return { data, total, page, loading, error };
}

