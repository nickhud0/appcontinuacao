/**
 * Utilitários de formatação padronizados pt-BR
 */

// Formatação de moeda brasileira
export const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(value || 0);
};

// Formatação de data brasileira
export const formatDate = (date: Date | string): string => {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat("pt-BR").format(dateObj);
};

// Formatação de data e hora brasileira
export const formatDateTime = (date: Date | string): string => {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit", 
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(dateObj);
};

// Formatação de número com decimais
export const formatNumber = (value: number, decimals: number = 2): string => {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(value || 0);
};

// Formatação de peso (kg)
export const formatWeight = (value: number): string => {
  return `${formatNumber(value, 2)} kg`;
};

// Converter data para formato YYYY-MM-DD (para queries) sem problemas de fuso horário
export const toYMD = (d: Date | string): string => {
  const dateObj = typeof d === 'string' ? new Date(d) : d;
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Converter data para formato YYYY-MM-DD (para queries) - deprecated, use toYMD()
export const toDateString = (date: Date): string => {
  return toYMD(date);
};

// Obter início do mês atual
export const getMonthStart = (): string => {
  const date = new Date();
  date.setDate(1);
  return toDateString(date);
};

// Obter início do ano atual
export const getYearStart = (): string => {
  const date = new Date();
  date.setMonth(0, 1);
  return toDateString(date);
};

// Named exports for compatibility
export { toYMD as convertToYMD };

// Default export with all utilities
export default {
  formatCurrency,
  formatDate,
  formatDateTime,
  formatNumber,
  formatWeight,
  toYMD,
  toDateString,
  getMonthStart,
  getYearStart
};