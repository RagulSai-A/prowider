import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const providers = await prisma.provider.findMany({
      orderBy: { id: "asc" },
      include: {
        assignments: {
          orderBy: { assigned_at: "desc" },
          include: {
            lead: {
              select: {
                id: true,
                customer_name: true,
                phone: true,
                city: true,
                service_id: true,
                description: true,
                created_at: true,
              },
            },
          },
        },
      },
    });

    const data = providers.map((p) => ({
      id: p.id,
      name: p.name,
      monthly_quota: p.monthly_quota,
      leads_received: p.leads_received,
      quota_remaining: p.monthly_quota - p.leads_received,
      leads: p.assignments.map((a) => ({
        assignment_id: a.id,
        assigned_at: a.assigned_at,
        lead: a.lead,
      })),
    }));

    return NextResponse.json(data);
  } catch (error) {
    console.error("[GET /api/providers]", error);
    return NextResponse.json(
      { error: "Failed to fetch providers." },
      { status: 500 }
    );
  }
}
