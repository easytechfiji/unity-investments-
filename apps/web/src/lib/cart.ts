'use client';

import type { CartLine } from '@od/shared';
import { useSyncExternalStore } from 'react';

// The browser keeps only product id, variant id and quantity. Prices are never
// stored here: the API works them out every time the cart is shown.

const KEY = 'od-cart-v1';
const EVENT = 'od-cart-change';
const MAX_LINE_QUANTITY = 999;

const positiveInt = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

/** Keeps only well formed lines, in case storage was edited by hand. The API checks them again anyway. */
function validLines(value: unknown): CartLine[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (line): line is CartLine =>
        typeof line === 'object' &&
        line !== null &&
        positiveInt((line as CartLine).productId) &&
        ((line as CartLine).variantId === null || positiveInt((line as CartLine).variantId)) &&
        positiveInt((line as CartLine).quantity) &&
        (line as CartLine).quantity <= MAX_LINE_QUANTITY,
    )
    .slice(0, 100)
    .map((line) => ({
      productId: line.productId,
      variantId: line.variantId,
      quantity: line.quantity,
    }));
}

let cache: CartLine[] | null = null;
let cacheRaw: string | null = null;

function read(): CartLine[] {
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    return cache ?? [];
  }
  if (raw === cacheRaw && cache) return cache;
  cacheRaw = raw;
  try {
    cache = validLines(raw ? JSON.parse(raw) : []);
  } catch {
    cache = [];
  }
  return cache;
}

function write(lines: CartLine[]): void {
  cache = lines;
  try {
    cacheRaw = JSON.stringify(lines);
    window.localStorage.setItem(KEY, cacheRaw);
  } catch {
    // Private browsing or storage turned off: the cart lasts for this page view only.
  }
  window.dispatchEvent(new Event(EVENT));
}

const sameLine = (a: CartLine, productId: number, variantId: number | null) =>
  a.productId === productId && a.variantId === variantId;

export const cart = {
  lines: read,
  /** The same product and variant added again increases the quantity. */
  add(productId: number, variantId: number | null, quantity: number): void {
    const lines = [...read()];
    const existing = lines.find((line) => sameLine(line, productId, variantId));
    if (existing) {
      existing.quantity = Math.min(existing.quantity + quantity, MAX_LINE_QUANTITY);
    } else {
      lines.push({ productId, variantId, quantity: Math.min(quantity, MAX_LINE_QUANTITY) });
    }
    write(lines.map((line) => ({ ...line })));
  },
  setQuantity(productId: number, variantId: number | null, quantity: number): void {
    write(
      read().map((line) =>
        sameLine(line, productId, variantId)
          ? { ...line, quantity: Math.min(Math.max(quantity, 1), MAX_LINE_QUANTITY) }
          : line,
      ),
    );
  },
  remove(productId: number, variantId: number | null): void {
    write(read().filter((line) => !sameLine(line, productId, variantId)));
  },
  clear(): void {
    write([]);
  },
};

function subscribe(callback: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === KEY) callback();
  };
  window.addEventListener(EVENT, callback);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(EVENT, callback);
    window.removeEventListener('storage', onStorage);
  };
}

const EMPTY: CartLine[] = [];

/** The cart lines, kept in step across components and browser tabs. */
export function useCart(): CartLine[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

export function useCartCount(): number {
  return useCart().reduce((sum, line) => sum + line.quantity, 0);
}
