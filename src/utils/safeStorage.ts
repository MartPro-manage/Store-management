/**
 * Safe storage utility wrapper that prevents runtime exceptions
 * in restricted security contexts (iframes, private browsing, disabled cookies/storage).
 * Supports both localStorage and sessionStorage operations safely.
 */

export const safeStorage = {
  getItem: (key: string): string | null => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage.getItem(key);
      }
    } catch (e) {
      console.warn(`safeStorage.getItem error for key "${key}":`, e);
    }
    return null;
  },

  setItem: (key: string, value: string): void => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(key, value);
      }
    } catch (e) {
      console.warn(`safeStorage.setItem error for key "${key}":`, e);
    }
  },

  removeItem: (key: string): void => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(key);
      }
    } catch (e) {
      console.warn(`safeStorage.removeItem error for key "${key}":`, e);
    }
  },

  getSessionItem: (key: string): string | null => {
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        return window.sessionStorage.getItem(key);
      }
    } catch (e) {
      console.warn(`safeStorage.getSessionItem error for key "${key}":`, e);
    }
    return null;
  },

  setSessionItem: (key: string, value: string): void => {
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        window.sessionStorage.setItem(key, value);
      }
    } catch (e) {
      console.warn(`safeStorage.setSessionItem error for key "${key}":`, e);
    }
  },

  removeSessionItem: (key: string): void => {
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        window.sessionStorage.removeItem(key);
      }
    } catch (e) {
      console.warn(`safeStorage.removeSessionItem error for key "${key}":`, e);
    }
  },

  clear: (): void => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.clear();
      }
      if (typeof window !== 'undefined' && window.sessionStorage) {
        window.sessionStorage.clear();
      }
    } catch (e) {
      console.warn('safeStorage.clear error:', e);
    }
  }
};
