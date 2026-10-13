# UClean

Laundry pickup and delivery web app. Next.js App Router, Supabase Postgres,
deployed on Vercel.

This repository is the **foundation scaffold** described in
[UClean Laundry Web App Architecture.md](./UClean%20Laundry%20Web%20App%20Architecture.md).
It provides the runnable project, the complete database schema with RLS, the
role guards, the auth flow, and every route in the architecture document as a
typed stub. Business features are built in the milestones listed below.

## What works today

- Full schema: 18 tables, enums, indexes, RLS policies, SQL functions
- Phone OTP sign up and login, with a real profile auto-created by a trigger
- Role-guarded `/account`, `/staff` and `/admin` panels
- Server-side 6 km driving-distance check, unpassable from the browser
- Signed, expiring payment tokens for `/pay/[token]`
- Notification queue with retries, and cron + webhook endpoints that verify
  signatures and reject replayed deliveries

## What does not work yet

The booking wizard, slot booking, invoicing forms, WhatsApp sending, and the
admin CRUD forms are **not built**. Their server-side logic exists and is
wired; their user interfaces land in the milestones below.

| Milestone                    | Scope                                                        |
| ---------------------------- | ------------------------------------------------------------ |
| 1. Foundation                | **This repo**                                                |
| 2. Public site               | Hero carousel, About, Services, Why UClean, Contact, Footer  |
| 3. User booking              | Wizard, 6 km check, slot booking, order creation, tracking   |
| 4. Admin core                | Customers, pickups, assignment, order updates, slot settings |
| 5. Staff panel               | Pickup and delivery lists, status updates                    |
| 6. Billing and WhatsApp      | Invoice UI, provider templates, Cash on Delivery flow        |
| 7. Walk-in, sales, analytics | Walk-in orders, reports, dashboard charts                    |
| 8. Testing and launch        | UAT, security review, production deploy                      |

## Prerequisites

- Node.js 20.11 or newer
- Docker (for the local Supabase stack)
- [Supabase CLI](https://supabase.com/docs/guides/cli)

## Getting started

```bash
npm install
cp .env.example .env.local

# Start the local database. Print the API URL and keys it generates.
supabase start

# Paste those keys into .env.local, then load the schema and seed data.
supabase db reset

# Set CRON_SECRET to any long random string so cron endpoints work locally.
npm run dev
```

The app runs at <http://localhost:3000>.

### Getting an admin account

The auth trigger creates every account as a `customer`. Promote yourself once:

```bash
supabase db reset          # or any SQL client
```

```sql
update public.profiles set role = 'admin' where mobile = '+919876543210';
```

## Two settings you must set before booking works

Both are deliberate: they are undecided in the source architecture document, and
inventing values would silently mis-zone customers or mislead about capacity.

1. **Store coordinates.** `store_settings.lat` and `.lng` ship as `NULL`.
   Until they are set, every pickup attempt returns _"the store location is not
   configured yet"_ rather than checking distance against a guess. Set them in
   `/admin/settings`.

2. **Slot capacity.** `time_slots.capacity` ships as `0`, which reads as full,
   because _"how many pickups per hourly slot?"_ is still open. Set a capacity
   per slot in `/admin/slots`.

## Architecture notes

Two decisions are worth knowing before you extend this.

**The database is the authority on order status.** The state machine exists in
`src/lib/order-status.ts` for rendering buttons, and separately in
`public.allowed_order_transition` for enforcement. The trigger
`orders_enforce_transition` rejects anything the UI did not offer. Change both
together; `src/lib/order-status.test.ts` pins the TypeScript side against a copy
of the SQL clause.

**Orders have no INSERT policy.** They are created only by `book_pickup`, which
runs `SECURITY DEFINER` and, inside one transaction, locks the slot row, checks
capacity, re-checks the delivery zone, and inserts the order and its booking.
That row lock is what stops two customers taking the last place in a slot.

## Commands

| Command             | Purpose                                          |
| ------------------- | ------------------------------------------------ |
| `npm run dev`       | Development server                               |
| `npm run build`     | Production build                                 |
| `npm run lint`      | ESLint                                           |
| `npm run format`    | Prettier                                         |
| `npm run typecheck` | `tsc --noEmit`                                   |
| `npm run test`      | Vitest unit and component tests                  |
| `npm run test:e2e`  | Playwright smoke tests (needs a build)           |
| `npm run check`     | Format, lint, typecheck and unit tests in one go |

## Deployment

1. Create a Supabase project per environment. Two are expected: staging and
   production, each with its own environment variables.
2. Apply migrations with `supabase db push --linked`.
3. Set every variable in `.env.example` in the Vercel project. The service role
   key, Maps server key, WhatsApp token, payment keys and `PAYMENT_TOKEN_SECRET`
   must **never** be prefixed with `NEXT_PUBLIC_`.
4. Deploy. Configure the Vercel Cron schedules for `/api/cron/notifications` and
   `/api/cron/slots`, and set `CRON_SECRET` on the Vercel project so the
   scheduled requests carry the bearer token.
5. Point the payment and WhatsApp webhooks at the production domain once it is
   connected.

## Outstanding questions

These come from the source document and are still unanswered. Each has a
documented placeholder in the schema rather than an invented value.

| #   | Question                                       | Where it is handled                                             |
| --- | ---------------------------------------------- | --------------------------------------------------------------- |
| 1   | Are delivery agents staff, or a separate role? | Assumed staff with an `agents` row; `agents.id` = `profiles.id` |
| 2   | How many pickups per hourly slot?              | `time_slots.capacity`, seeded at 0                              |
| 3   | Single store, and what are its coordinates?    | Single-row `store_settings`, coordinates NULL                   |
| 4   | Which WhatsApp provider?                       | Cloud API wired; provider is swappable in `notifications.ts`    |
| 5   | Which payment gateway?                         | Razorpay assumed in the webhook                                 |
| 6   | Who chooses the delivery slot?                 | Customer or admin; both columns exist on `orders`               |
| 7   | GST and invoice numbering?                     | GSTIN on `store_settings`; GST-shaped invoice numbers           |
