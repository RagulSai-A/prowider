import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...");

  // ── Services ────────────────────────────────────────────────────────────
  await prisma.service.upsert({ where: { id: 1 }, update: {}, create: { id: 1, name: "Service 1" } });
  await prisma.service.upsert({ where: { id: 2 }, update: {}, create: { id: 2, name: "Service 2" } });
  await prisma.service.upsert({ where: { id: 3 }, update: {}, create: { id: 3, name: "Service 3" } });
  console.log("✓ Services seeded");

  // ── Providers ───────────────────────────────────────────────────────────
  for (let i = 1; i <= 8; i++) {
    await prisma.provider.upsert({
      where: { id: i },
      update: {},
      create: { id: i, name: `Provider ${i}`, monthly_quota: 10, leads_received: 0 },
    });
  }
  console.log("✓ Providers seeded (8)");

  // ── Service rotation state ───────────────────────────────────────────────
  // Service 1 mandatory: Provider 1 → pool: [2, 3, 4]
  await prisma.serviceRotation.upsert({
    where: { service_id: 1 },
    update: {},
    create: { service_id: 1, provider_pool: [2, 3, 4], next_index: 0 },
  });

  // Service 2 mandatory: Provider 5 → pool: [6, 7, 8]
  await prisma.serviceRotation.upsert({
    where: { service_id: 2 },
    update: {},
    create: { service_id: 2, provider_pool: [6, 7, 8], next_index: 0 },
  });

  // Service 3 mandatory: Providers 1, 4 → pool: [2, 3, 5, 6, 7, 8]
  await prisma.serviceRotation.upsert({
    where: { service_id: 3 },
    update: {},
    create: { service_id: 3, provider_pool: [2, 3, 5, 6, 7, 8], next_index: 0 },
  });
  console.log("✓ Service rotation state seeded");

  console.log("✅ Seeding complete!");
}

main()
  .catch((e: unknown) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
