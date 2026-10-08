// Cliente mínimo do protocolo de depuração (CDP) para automatizar o ALL MUSIC aberto com --dev.
// Uso: const page = await connect(); await page.eval('document.title');
const PORT = 9333;

const APP = t => t.type === 'page' && t.url.startsWith('http://127.0.0.1:38417');

/** Conecta à página do app ou, com `match`, a outro alvo (ex.: o iframe do player do YouTube). */
export async function connect(match = APP) {
  const targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
  const target = targets.find(match);
  if (!target) throw new Error('ALL MUSIC não está aberto com --dev');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = () => reject(new Error('falha ao conectar no CDP')); });

  let seq = 0;
  const pending = new Map();
  const listeners = new Map();
  ws.onmessage = message => {
    const data = JSON.parse(message.data);
    if (data.id) {
      const p = pending.get(data.id);
      pending.delete(data.id);
      if (data.error) p.reject(new Error(data.error.message));
      else p.resolve(data.result);
    } else {
      listeners.get(data.method)?.(data.params);
    }
  };

  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });

  return {
    send,
    on: (method, fn) => listeners.set(method, fn),
    close: () => ws.close(),
    /** Avalia uma expressão na página e devolve o valor (aceita await). */
    async eval(expression) {
      const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    },
  };
}

export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
