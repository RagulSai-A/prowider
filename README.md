# ⚡ Prowider Lead Distribution System

A robust, highly concurrent, and real-time Lead Distribution System built using **Next.js 14 App Router (Node.js)**, **Supabase PostgreSQL**, **Prisma ORM**, and **Tailwind-free Vanilla HSL CSS**.

---

## 🚀 Setup Instructions

### 1. Prerequisites
- **Node.js**: `v18.x` or `v20.x`+
- **Database**: A Supabase PostgreSQL instance (or any standard PostgreSQL database).

### 2. Local Environment Setup
Clone the repository, create a `.env` file in the root directory, and add your Supabase connection strings (making sure to URL-encode passwords containing special characters):

```env
# Connection pooled URL (used for application runtime queries)
DATABASE_URL="postgresql://<username>:<encoded-password>@<host>:6543/postgres?pgbouncer=true&connection_limit=1"

# Direct URL (used by Prisma for migrations/generation)
DIRECT_URL="postgresql://<username>:<encoded-password>@<host>:5432/postgres"
```

### 3. Installation & Database Setup
```bash
# Install dependencies
npm install

# Generate the Prisma Client
npx prisma generate

# Push database schema & Seed starting services/providers
npx prisma db push
npx prisma db seed
```

### 4. Running the App
```bash
# Run local development server
npm run dev

# Or build & run in Production Mode (Recommended)
npm run build
npm start
```
Visit the local server at `http://localhost:3000`.

---

## 🧠 Technical Architecture

### 1. Allocation Algorithm (State-Persistent Round Robin)
The application assigns leads to providers based on a fair, state-persistent **Round Robin** sequence tailored to the requested service.
- **Service Specific Rotation**: The current rotation index is stored in the database (`ServiceRotation` model) mapped to each `service_id` (1: Plumbing, 2: Electrical, 3: Landscaping).
- **Quota Validation**:
  - Providers start with a daily quota (e.g., `10` leads).
  - The algorithm fetches all active providers offering the requested service whose `quota_left` is strictly greater than `0`.
  - Providers are sorted by their database ID to maintain a deterministic ring sequence.
- **Sequence Assignment**:
  - The algorithm retrieves the `next_index` from the `ServiceRotation` table.
  - It finds the next eligible provider in the sorted ring starting at `next_index` (wrapping around with modular arithmetic `index % providers.length`).
  - It decreases the allocated provider's `quota_left` by 1.
  - It updates `next_index` in `ServiceRotation` to the next position in the sequence, ensuring state persistence across serverless executions.

---

### 2. Concurrency Handling (Race-Condition Prevention)
In a high-traffic environment, multiple customers might request the same service simultaneously. Simple queries would cause race conditions (e.g., two requests reading the same `next_index` simultaneously, assigning the lead to the same provider, and skipping the next in line).

To prevent this:
- **Database Row-Level Locking (`SELECT FOR UPDATE`)**: 
  We run the allocation process within an isolated **Prisma Transaction** (`$transaction`).
  ```sql
  SELECT * FROM "ServiceRotation" WHERE "service_id" = $1 FOR UPDATE;
  ```
  - `FOR UPDATE` places an exclusive lock on that service's rotation row. 
  - If 10 requests hit the server simultaneously, PostgreSQL serializes them. The 2nd request is blocked until the 1st request finishes updating the index and completes its transaction.
- **Connection Isolation**:
  To protect against pool exhaustion during heavy locking, we configure `connection_limit=1` on our `DATABASE_URL` (pooler), allowing efficient queueing.

---

### 3. Webhook Idempotency (Exactly-Once Execution)
Our quota-reset webhook at `/api/webhook/quota-reset` is designed to be triggered by external cron services or event hooks. If the network retries a request, or if multiple nodes trigger it concurrently, we must prevent double-processing (which would double quotas or cause database conflicts).

- **Unique Event Constraints**:
  We maintain a `WebhookEvent` table in our database with a `UNIQUE` constraint on the `idempotency_key` column.
- **Atomic Operations**:
  When a request arrives with an `X-Idempotency-Key` header:
  1. It attempts to write a new record to `WebhookEvent` containing the key.
  2. If the write succeeds, the request proceeds, resets the provider quotas, and updates the event status to `PROCESSED`.
  3. If the write fails (throwing a Prisma `P2002` duplicate key error), it means another server thread is already processing or has completed this webhook.
  4. The duplicate request is immediately halted and returns a graceful `200 OK` with `{ already_processed: true }`, completely avoiding double-execution.
