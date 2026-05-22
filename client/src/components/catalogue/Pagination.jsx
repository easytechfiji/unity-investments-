import React from 'react';

const Pagination = ({ currentPage = 1, totalPages = 1, onPageChange = () => {} }) => {
  const pages = [];
  for (let i = 1; i <= totalPages; i++) pages.push(i);

  return (
    <div className="pagination fade-in" role="navigation" aria-label="Pagination">
      <button onClick={() => onPageChange(currentPage - 1)} disabled={currentPage <= 1}>Previous</button>

      {pages.map((p) => (
        <button key={p} onClick={() => onPageChange(p)} aria-current={p === currentPage}>{p}</button>
      ))}

      <button onClick={() => onPageChange(currentPage + 1)} disabled={currentPage >= totalPages}>Next</button>

      <style>{`
        .pagination { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; align-items: center; padding: 24px 0 0; }
        .pagination button { min-height: 40px; padding: 8px 13px; border: 1px solid var(--border); border-radius: 8px; background: var(--white); color: var(--ink); cursor: pointer; }
        .pagination button[aria-current="true"] { border-color: var(--accent); background: var(--accent); color: var(--white); }
        .pagination button[disabled] { opacity: 0.5; cursor: default; }

        @media (max-width: 480px) {
          .pagination { justify-content: stretch; }
          .pagination button { flex: 1 1 auto; }
        }
      `}</style>
    </div>
  );
};

export default Pagination;
