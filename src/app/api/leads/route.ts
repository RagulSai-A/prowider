import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { allocateProviders } from "@/lib/allocation";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { customer_name, phone, city, service_id, description } = body;

    // ── Basic validation ────────────────────────────────────────────────
    if (!customer_name || !phone || !city || !service_id || !description) {
      return NextResponse.json(
        { error: "All fields are required." },
        { status: 400 }
      );
    }

    const sid = Number(service_id);
    if (![1, 2, 3].includes(sid)) {
      return NextResponse.json(
        { error: "Invalid service type." },
        { status: 400 }
      );
    }

    // ── Create lead (DB-level unique constraint catches duplicates) ──────
    let lead;
    try {
      lead = await prisma.lead.create({
        data: {
          customer_name: String(customer_name).trim(),
          phone: String(phone).trim(),
          city: String(city).trim(),
          service_id: sid,
          description: String(description).trim(),
        },
      });
    } catch (err: unknown) {
      // Prisma throws P2002 on unique constraint violation
      if (
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        (err as { code: string }).code === "P2002"
      ) {
        return NextResponse.json(
          {
            error:
              "A lead for this phone number and service already exists. Duplicate submissions are not allowed.",
          },
          { status: 409 }
        );
      }
      throw err;
    }

    // ── Allocate providers (async, non-blocking from client perspective) ─
    // We await it here so errors surface properly, but it's wrapped safely.
    await allocateProviders(lead.id, sid);

    return NextResponse.json(
      { success: true, lead_id: lead.id },
      { status: 201 }
    );
  } catch (error) {
    console.error("[POST /api/leads]", error);
    return NextResponse.json(
      { error: "Internal server error. Please try again." },
      { status: 500 }
    );
  }
}
