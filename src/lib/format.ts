export function formatMoney(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function formatNumber(value: number): string {
  return value.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('pt-BR');
}

export async function unwrap<T>(promise: Promise<{ ok: true; data: T } | { ok: false; error: string }>): Promise<T> {
  const result = await promise;
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.data;
}
