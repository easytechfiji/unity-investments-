import { useEffect, useState } from 'react';

export default function useItems({ category, page = 1, limit = 12, search = '' } = {}) {
  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;
    const base = import.meta.env.VITE_API_URL || '';
    setLoading(true);
    const params = new URLSearchParams();
    if (category) params.set('category', category);
    if (page) params.set('page', String(page));
    if (limit) params.set('limit', String(limit));
    if (search) params.set('search', search);

    fetch(`${base}/api/items?${params.toString()}`)
      .then((r) => {
        if (!r.ok) throw new Error('Network response was not ok');
        return r.json();
      })
      .then((json) => {
        if (!mounted) return;
        setData(json.items || json.data || []);
        setTotal(json.total || 0);
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err);
      })
      .finally(() => mounted && setLoading(false));

    return () => {
      mounted = false;
    };
  }, [category, page, limit, search]);

  return { data, total, page, loading, error };
}

