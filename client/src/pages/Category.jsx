import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import Layout from '../components/layout/Layout';
import CategoryHero from '../components/catalogue/CategoryHero';
import SearchBar from '../components/catalogue/SearchBar';
import ItemGrid from '../components/catalogue/ItemGrid';
import Pagination from '../components/catalogue/Pagination';
import Contact from '../components/home/Contact';
import useItems from '../hooks/useItems';

const Category = () => {
  const { slug } = useParams();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('newest');

  const { data, total, loading, error } = useItems({ category: slug, page, limit: 12, search });

  useEffect(() => {
    setPage(1);
  }, [slug, search, sort]);

  return (
    <Layout>
      <CategoryHero categoryName={slug} categoryDescription={`Explore items in ${slug}`} />

      <SearchBar onSearch={setSearch} onSort={setSort} />

      <div className="container">
        {error && <div className="error">Error loading items</div>}
        <ItemGrid items={data} loading={loading} />
        <Pagination currentPage={page} totalPages={Math.max(1, Math.ceil((total || (data && data.length)) / 12))} onPageChange={setPage} />
      </div>

      <Contact />
    </Layout>
  );
};

export default Category;

