import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/webhook/quota-reset
 *
 * Simulates a payment gateway webhook that resets all providers' monthly
 * quota back to 10.
 *
 * Idempotency: The caller MUST supply an `X-Idempotency-Key` header (a UUID
 * or any unique string). If the same key is sent again, the server returns
 * 200 with `"already_processed": true` and does NOT reset quotas again.
 *
 * This ensures calling this endpoint 100 × with the same key is identical
 * to calling it once.
 */
export async function POST(req: NextRequest) {
  try {
    const idempotencyKey = req.headers.get("x-idempotency-key");

    if (!idempotencyKey || idempotencyKey.trim() === "") {
      return NextResponse.json(
        { error: "X-Idempotency-Key header is required." },
        { status: 400 }
      );
    }

    // ── Idempotency check (atomic upsert) ───────────────────────────────
    // We try to insert the key. If it already exists, skipDuplicates
    // means nothing is inserted and we detect that by checking if the
    // record exists.
    let alreadyProcessed = false;
    try {
      await prisma.webhookEvent.create({
        data: {
          idempotency_key: idempotencyKey,
          action: "quota_reset",
        },
      });
    } catch (err: unknown) {
      if (
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        (err as { code: string }).code === "P2002"
      ) {
        alreadyProcessed = true;
      } else {
        throw err;
      }
    }

    if (alreadyProcessed) {
      const event = await prisma.webhookEvent.findUnique({
        where: { idempotency_key: idempotencyKey },
      });
      return NextResponse.json({
        success: true,
        already_processed: true,
        processed_at: event?.processed_at,
        message:
          "This webhook event was already processed. Quota was NOT reset again.",
      });
    }

    // ── Reset all providers' quota ──────────────────────────────────────
    await prisma.provider.updateMany({
      data: {
        monthly_quota: 10,
        leads_received: 0,
      },
    });

    return NextResponse.json({
      success: true,
      already_processed: false,
      message: "Quota reset successful. All providers restored to 10 leads.",
    });
  } catch (error) {
    console.error("[POST /api/webhook/quota-reset]", error);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 }
    );
  }
}
