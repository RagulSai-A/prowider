import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { emit } from "@/lib/sse-emitter";

/**
 * Business rules — mandatory provider IDs per service.
 * After mandatory assignments, remaining slots come from the fair-rotation pool.
 */
const MANDATORY: Record<number, number[]> = {
  1: [1],
  2: [5],
  3: [1, 4],
};

const TOTAL_SLOTS = 3;

/**
 * Allocate providers for a newly created lead.
 *
 * Concurrency safety: We lock the `service_rotations` row with
 * `SELECT ... FOR UPDATE` inside a serializable transaction so that
 * simultaneous lead creation for the same service is fully serialized.
 * Different services run in parallel (different row locks).
 *
 * Fairness: A per-service round-robin cursor (`next_index`) advances
 * through the eligible pool on every allocation. The cursor is stored in
 * the database and therefore survives server restarts.
 */
export async function allocateProviders(
  leadId: string,
  serviceId: number
): Promise<void> {
  await prisma.$transaction(
    async (tx: Prisma.TransactionClient) => {
      // ── 1. Lock the rotation row for this service (prevents races) ──────
      await tx.$executeRaw`
        SELECT service_id FROM service_rotations
        WHERE service_id = ${serviceId}
        FOR UPDATE
      `;

      const rotation = await tx.serviceRotation.findUniqueOrThrow({
        where: { service_id: serviceId },
      });

      const mandatory = MANDATORY[serviceId] ?? [];
      const assigned: number[] = [];

      // ── 2. Assign mandatory providers (if quota not exhausted) ──────────
      for (const pid of mandatory) {
        const provider = await tx.provider.findUnique({ where: { id: pid } });
        if (!provider) continue;
        if (provider.leads_received >= provider.monthly_quota) continue;

        await tx.provider.update({
          where: { id: pid },
          data: { leads_received: { increment: 1 } },
        });
        await tx.leadAssignment.create({
          data: { lead_id: leadId, provider_id: pid },
        });
        assigned.push(pid);
      }

      // ── 3. Fill remaining slots via round-robin pool ────────────────────
      const slotsNeeded = TOTAL_SLOTS - assigned.length;
      const pool = rotation.provider_pool; // e.g. [2, 3, 4]
      let index = rotation.next_index;
      let picked = 0;
      let attempts = 0;

      while (picked < slotsNeeded && attempts < pool.length) {
        const pid = pool[index % pool.length];
        index++;
        attempts++;

        if (assigned.includes(pid)) continue;

        const provider = await tx.provider.findUnique({ where: { id: pid } });
        if (!provider) continue;
        if (provider.leads_received >= provider.monthly_quota) continue;

        await tx.provider.update({
          where: { id: pid },
          data: { leads_received: { increment: 1 } },
        });
        await tx.leadAssignment.create({
          data: { lead_id: leadId, provider_id: pid },
        });
        assigned.push(pid);
        picked++;
      }

      // ── 4. Persist the advanced cursor ─────────────────────────────────
      // We advance by the number of items we consumed from the pool, keeping
      // the cursor modular so it wraps correctly on next allocation.
      const newIndex = pool.length > 0 ? index % pool.length : 0;
      await tx.serviceRotation.update({
        where: { service_id: serviceId },
        data: { next_index: newIndex },
      });
    },
    { timeout: 15000 } // 15 s max to avoid long lock holds
  );

  // ── 5. Notify SSE clients after the transaction commits ─────────────────
  emit("new_assignment", { leadId, serviceId, timestamp: Date.now() });
}
