import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import CategoryHero from '../components/catalogue/CategoryHero';
import SearchBar from '../components/catalogue/SearchBar';
import ItemGrid from '../components/catalogue/ItemGrid';
import Pagination from '../components/catalogue/Pagination';
import Contact from '../components/home/Contact';
import useItems from '../hooks/useItems';

const formatCategoryName = (value = '') =>
  value
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

const Category = () => {
  const { slug } = useParams();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('newest');
  const categoryTitle = formatCategoryName(slug);

  const { data, total, loading, error } = useItems({ category: slug, page, limit: 12, search });

  useEffect(() => {
    setPage(1);
  }, [slug, search, sort]);

  return (
    <div className="category-page">
      <CategoryHero title={categoryTitle} description={`Explore items in ${categoryTitle}`} />

      <SearchBar onSearch={setSearch} onSort={setSort} />

      <div className="category-results container">
        {error && <div className="error">Error loading items</div>}
        <ItemGrid items={data} loading={loading} />
        <Pagination currentPage={page} totalPages={Math.max(1, Math.ceil((total || (data && data.length)) / 12))} onPageChange={setPage} />
      </div>

      <Contact />

      <style>{`
        .category-page { background: #f9f7f4; color: var(--ink); }
        .category-results { padding-top: 10px; padding-bottom: clamp(54px, 7vw, 88px); }
        .error { margin-bottom: 18px; padding: 14px 16px; border: 1px solid rgba(200,169,110,0.35); border-radius: 8px; background: rgba(255,255,255,0.78); color: var(--ink); }

        @media (max-width: 768px) {
          .category-results { padding-top: 0; }
        }
      `}</style>
    </div>
  );
};

export default Category;

