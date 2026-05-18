import { NextRequest } from "next/server";
import { subscribe } from "@/lib/sse-emitter";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/sse
 *
 * Server-Sent Events endpoint. The dashboard subscribes here and receives
 * `new_assignment` events whenever a lead is assigned to providers.
 */
export async function GET(req: NextRequest) {
  let unsubscribe: (() => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      // Send an initial "connected" ping so the client knows it's live
      controller.enqueue(
        encoder.encode("event: connected\ndata: {}\n\n")
      );

      // Register this client
      unsubscribe = subscribe((payload: string) => {
        try {
          controller.enqueue(encoder.encode(payload));
        } catch {
          // Client disconnected
        }
      });

      // Keep-alive heartbeat every 25 seconds to prevent proxy timeouts
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": heartbeat\n\n"));
        } catch {
          clearInterval(heartbeat);
        }
      }, 25000);

      // Clean up when the client disconnects
      req.signal.addEventListener("abort", () => {
        clearInterval(heartbeat);
        if (unsubscribe) unsubscribe();
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
    },
    cancel() {
      if (unsubscribe) unsubscribe();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // disable Nginx buffering
    },
  });
}
