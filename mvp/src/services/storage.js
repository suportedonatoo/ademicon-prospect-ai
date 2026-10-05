// Adaptador de persistência.
// Hoje: localStorage do navegador (cada navegador tem seus próprios dados demo).
// Amanhã: um ApiAdapter com a mesma interface (getAll / saveAll / get / set)
// que chama o backend — nenhum serviço precisa mudar.
import { config } from '../config.js';

class LocalStorageAdapter {
  key(name) {
    return config.storagePrefix + name;
  }
  get(name, fallback = null) {
    try {
      const raw = localStorage.getItem(this.key(name));
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }
  set(name, value) {
    try {
      localStorage.setItem(this.key(name), JSON.stringify(value));
    } catch {
      /* modo privado / armazenamento cheio: mantém em memória */
    }
    memory[name] = value;
  }
  clear() {
    try {
      Object.keys(localStorage)
        .filter((k) => k.startsWith(config.storagePrefix))
        .forEach((k) => localStorage.removeItem(k));
    } catch {
      /* ignora */
    }
    Object.keys(memory).forEach((k) => delete memory[k]);
  }
}

const memory = {};

// Placeholder da integração futura com banco de dados real
class ApiAdapter {
  constructor() {
    throw new Error('ApiAdapter ainda não implementado — defina dataProvider: "local" em config.js');
  }
}

export const storage = config.dataProvider === 'api' ? new ApiAdapter() : new LocalStorageAdapter();

// Notifica telas abertas (inclusive outra aba) quando os dados mudam.
const listeners = new Set();
export function onDataChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function emitDataChange(what) {
  listeners.forEach((fn) => fn(what));
}
try {
  window.addEventListener('storage', (e) => {
    if (e.key && e.key.startsWith(config.storagePrefix)) emitDataChange('external');
  });
} catch {
  /* ignora */
}
