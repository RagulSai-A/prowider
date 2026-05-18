/**
 * SSE Emitter — in-process pub/sub for Server-Sent Events.
 *
 * In development (single process), this fan-outs to all connected dashboard clients.
 * For multi-instance production, replace with Redis pub/sub.
 */

type SSECallback = (payload: string) => void;

// Global registry of active SSE connections. Uses globalThis so Hot Module
// Replacement in Next.js dev mode doesn't reset the registry on each save.
const g = globalThis as typeof globalThis & { _sseClients?: Set<SSECallback> };
if (!g._sseClients) g._sseClients = new Set<SSECallback>();
const clients: Set<SSECallback> = g._sseClients;

/** Register a new SSE client. Returns an unsubscribe function. */
export function subscribe(callback: SSECallback): () => void {
  clients.add(callback);
  return () => clients.delete(callback);
}

/** Broadcast an event to all connected SSE clients. */
export function emit(event: string, data: unknown): void {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  clients.forEach((cb) => {
    try {
      cb(payload);
    } catch {
      clients.delete(cb);
    }
  });
}
