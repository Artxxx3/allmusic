// Persistência simples em localStorage, com cache em memória.
const mem = new Map();

export const store = {
  get(key, fallback) {
    if (!mem.has(key)) {
      let value = fallback;
      try {
        const raw = localStorage.getItem('am.' + key);
        if (raw != null) value = JSON.parse(raw);
      } catch { }
      mem.set(key, value);
    }
    return mem.get(key);
  },
  set(key, value) {
    mem.set(key, value);
    try { localStorage.setItem('am.' + key, JSON.stringify(value)); } catch { }
  },
  del(key) {
    mem.delete(key);
    try { localStorage.removeItem('am.' + key); } catch { }
  },
};

export const keyOf = t => t.src + ':' + t.id;
