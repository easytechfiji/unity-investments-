export function formatPrice(v){
  if (v == null) return ''
  return `$${Number(v).toFixed(2)}`
}

export function formatDate(d){
  return new Date(d).toLocaleDateString()
}
