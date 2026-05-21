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
        .pagination { display: flex; gap: 8px; justify-content: center; align-items: center; padding: 20px 0; }
        .pagination button[disabled] { opacity: 0.5; cursor: default; }
      `}</style>
    </div>
  );
};

export default Pagination;
