import { useEffect, useState } from 'react';

export default function useCategories() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;
    const base = import.meta.env.VITE_API_URL || '';
    setLoading(true);

    fetch(`${base}/api/categories`)
      .then((r) => {
        if (!r.ok) throw new Error('Network response was not ok');
        return r.json();
      })
      .then((json) => {
        if (!mounted) return;
        setData(Array.isArray(json) ? json : []);
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err);
      })
      .finally(() => mounted && setLoading(false));

    return () => {
      mounted = false;
    };
  }, []);

  return { data, loading, error };
}

