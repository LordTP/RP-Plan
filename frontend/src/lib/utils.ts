import { clsx, type ClassValue } from 'clsx';
import { format, parseISO } from 'date-fns';

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function formatDate(dateString: string | null): string {
  if (!dateString) return '-';
  try {
    return format(parseISO(dateString), 'dd/MM/yyyy');
  } catch {
    return dateString;
  }
}

export function formatDateForInput(dateString: string | null): string {
  if (!dateString) return '';
  try {
    return format(parseISO(dateString), 'yyyy-MM-dd');
  } catch {
    return '';
  }
}

export function formatCurrency(value: number | null): string {
  if (value === null || value === undefined) return '-';
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
  }).format(value);
}

export function formatNumber(value: number | null): string {
  if (value === null || value === undefined) return '-';
  return new Intl.NumberFormat('en-GB').format(value);
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

export function getStatusColor(status: string): string {
  const statusLower = status?.toLowerCase() || '';

  if (statusLower.includes('delivered') || statusLower.includes('complete')) {
    return 'bg-green-100 text-green-800';
  }
  if (statusLower.includes('shipped') || statusLower.includes('transit')) {
    return 'bg-blue-100 text-blue-800';
  }
  if (statusLower.includes('production') || statusLower.includes('manufacturing')) {
    return 'bg-yellow-100 text-yellow-800';
  }
  if (statusLower.includes('pending') || statusLower.includes('waiting')) {
    return 'bg-orange-100 text-orange-800';
  }
  if (statusLower.includes('cancelled') || statusLower.includes('canceled')) {
    return 'bg-red-100 text-red-800';
  }
  if (statusLower.includes('approved')) {
    return 'bg-teal-100 text-teal-800';
  }

  return 'bg-gray-100 text-gray-800';
}
