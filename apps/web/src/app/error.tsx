'use client';

// Shown when something fails while rendering a page. No technical details are shown.
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="wrap page prose">
      <h1>Something went wrong</h1>
      <p>This page could not be loaded just now. Please try again in a moment.</p>
      <button className="btn" type="button" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
