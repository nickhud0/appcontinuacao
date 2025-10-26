/**
 * Sistema de logging padronizado
 * - debug: apenas em desenvolvimento
 * - info: sempre visível  
 * - error: sempre visível
 */
export const logger = {
  debug: (...args: any[]) => {
    if (process.env.NODE_ENV === "development") {
      console.log(...args);
    }
  },
  
  info: (...args: any[]) => {
    if (process.env.NODE_ENV === "development") {
      console.log(...args);
    }
  },
  
  error: (...args: any[]) => {
    console.error(...args);
  },
  
  warn: (...args: any[]) => {
    console.warn(...args);
  }
};