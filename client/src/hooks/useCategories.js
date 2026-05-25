import { useEffect, useState } from 'react';
import supabase from '../lib/supabase';

export default function useCategories() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(null);

    async function loadCategories() {
      if (!supabase) {
        if (!mounted) return;
        setData([]);
        setError(new Error('Supabase is not configured'));
        setLoading(false);
        return;
      }

      const { data: categories, error: categoriesError } = await supabase
        .from('categories')
        .select('id, slug, name, description, sort_order')
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true });

      if (!mounted) return;

      if (categoriesError) {
        setError(categoriesError);
        setData([]);
      } else {
        setData(categories || []);
      }

      setLoading(false);
    }

    loadCategories().catch((err) => {
        if (!mounted) return;
        setError(err);
        setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  return { data, loading, error };
}

