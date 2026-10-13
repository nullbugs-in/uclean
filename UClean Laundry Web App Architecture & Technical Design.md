# UClean Laundry Pickup & Delivery Web App: Architecture & Technical Design

Prepared for: Moideen E M | Prepared by: Null Bugs | Stack: Next.js + Supabase, deployed on Vercel

## 1. Goals and Scope

UClean is a mobile-friendly web app where customers book laundry pickup and delivery, track orders, and pay. It has three panels (User, Staff, Admin) plus a public marketing site. Pickup is allowed only within **6 km driving distance** of the store.

**Phase 1:** Public site, sign up/login with OTP, pickup booking with 6 km check, slot booking, admin and staff panels, order tracking, billing, WhatsApp/OTP notifications, **Cash on Delivery**.

**Phase 2:** Online payments through a payment gateway (UPI, cards, netbanking, wallets) via a WhatsApp payment link, and new poster cards on the home page.

## 2. Recommended Tech Stack

| Layer | Choice | Why |
| --- | --- | --- |
| Frontend + backend | Next.js (App Router, TypeScript) | One codebase for pages, API routes and server actions; native fit for Vercel |
| UI | Tailwind CSS + shadcn/ui | Fast, responsive, consistent across all three panels |
| Database | Supabase Postgres | Relational data (orders, items, invoices), row level security, SQL functions |
| Auth | Supabase Auth (phone OTP) | Mobile number + OTP sign up and login |
| Realtime | Supabase Realtime | Live status updates in user, staff and admin dashboards |
| File storage | Supabase Storage | Product photos taken at pickup, invoice PDFs |
| Maps | Google Maps JS + Places Autocomplete + Routes/Distance Matrix API | Location picker and driving distance check |
| Messaging | WhatsApp Business Cloud API (Meta), or a provider such as Twilio/Gupshup/Interakt | Order updates, invoice link, OTP |
| SMS OTP | Supabase phone provider (Twilio or MSG91) | SMS OTP; India needs DLT registration |
| Payments (Phase 2) | Razorpay (or Cashfree/PayU) | UPI, cards, netbanking, wallets, webhooks |
| Scheduled jobs | Vercel Cron + Supabase Edge Functions | Reminders, retries, slot housekeeping |
| Hosting | Vercel | Git-based deploys, preview URLs, edge network |

## 3. High-Level Architecture

**Client layer:** Public website, User panel, Staff panel and Admin panel, all in one Next.js app, separated by route groups and role checks (middleware).

**Application layer (Vercel):** Server components for pages, server actions and API routes for business logic, and webhook endpoints (WhatsApp delivery status, payment gateway).

**Data layer (Supabase):** Postgres with row level security (RLS), Auth, Realtime, Storage, and Edge Functions for background work.

**External services:** Google Maps (distance), WhatsApp Business API (messages), SMS/OTP provider, payment gateway (Phase 2).

**Request flow example:** User submits pickup form → Next.js server action validates input → calls Google Routes API for driving distance → if within 6 km, calls a Supabase SQL function that reserves the slot and creates the order in one transaction → auto-assignment picks a free agent → notification rows are queued → WhatsApp message sent → Realtime pushes the new order to admin and staff dashboards.

## 4. Route Structure (Next.js)

**Public**

- `/` Home: Hero, About, Services, Why UClean, Contact, Footer
- `/services` Service and price list
- `/book` Book Now page
- `/auth/signup`, `/auth/login`, `/auth/verify-otp`

**User panel (`/account`)**

- `/account` Dashboard (active orders)
- `/account/book` Pickup booking wizard
- `/account/orders` and `/account/orders/[id]` Tracking timeline
- `/account/profile` Edit name, mobile, addresses

**Staff panel (`/staff`)**

- `/staff/pickups`, `/staff/deliveries`, `/staff/orders/[id]`, `/staff/bills`

**Admin panel (`/admin`)**

- `/admin` Dashboard and analytics
- `/admin/customers`, `/admin/pickups`, `/admin/orders`, `/admin/billing`
- `/admin/deliveries`, `/admin/agents`, `/admin/slots`, `/admin/walk-in`
- `/admin/notifications`, `/admin/sales`, `/admin/services` (price list), `/admin/settings`

**Public payment page**

- `/pay/[token]` Secure invoice and checkout page opened from the WhatsApp link (no login needed; the token is a signed, unguessable, expiring value)

## 5. Public Website Design

**Home page sections, in order:**

1. **Hero** with a 3-slide poster carousel: Express Service, Shoe Cleaning, Curtain Cleaning. Slides are driven by a `hero_slides` table (image, title, link, sort order, active flag) so new cards can be added in the next phase without code changes. Two buttons: **Services** (scrolls to services) and **Book Now** (goes to `/book`).
2. **About** section.
3. **Services** section (reads from the `services` table, so prices stay live).
4. **Why UClean** section (pickup and delivery, hygiene, on-time, transparent pricing).
5. **Contact** section: store address, embedded Google Map, **Chat on WhatsApp** button (`wa.me` link with a prefilled message).
6. **Footer**: links, hours, social links, legal pages.

**Book Now page:** Explains the four steps (location check, OTP, slot, order updates) with a **Book Now** button. If the visitor is not logged in, the button redirects to sign up / login with a `redirect=/account/book` parameter, and returns them to the booking wizard after OTP success.

## 6. User Panel Workflow

### 6.1 Sign up and login

1. User enters **name and mobile number**.
2. Supabase sends an OTP to the mobile number (SMS, or WhatsApp if configured). User enters OTP; account is created.
3. Name and mobile are stored once in `profiles`. Every other screen (booking form, invoices on screen, notifications) **reads from `profiles` by user id** instead of copying values. This is how an edit in the profile reflects everywhere automatically.
4. Exception: invoices and delivered orders keep a snapshot of name and address as they were at the time, for accounting accuracy.

### 6.2 Pickup booking wizard

- **Step 0, Notice pop-up:** 'Pickup is available only within 6 km driving distance.' The user must accept to continue (acceptance timestamp saved on the order).
- **Step 1, Pickup details and location:** Name and phone prefilled from profile; email, WhatsApp number, address; map pin or Places autocomplete, plus a 'Use my current location' option. The server computes **driving distance** from the store coordinates using the Google Routes / Distance Matrix API. Distance of 6 km or less proceeds; otherwise the user sees a clear 'outside delivery zone' message. The check is done **server side** and re-checked at order creation, so it cannot be bypassed from the browser.
- **Step 2, OTP verification:** The login OTP already proves the account number. If the WhatsApp/pickup number differs from the login number, send an OTP to that number as well, so WhatsApp messages go to a verified number.
- **Step 3, Slot booking:** Hourly slots, 10 AM to 2 PM and 3 PM to 8 PM (nine slots a day: 10-11, 11-12, 12-1, 1-2, 3-4, 4-5, 5-6, 6-7, 7-8). Full slots are disabled; past slots for today are hidden.
- **Step 4, Confirmation and tracking:** Order is created; user sees order id and the tracking timeline.

### 6.3 Tracking

Customer-facing timeline: Pickup Scheduled → Agent Assigned → Picked Up → In Process → Ready → Out for Delivery → Delivered. It updates live through Supabase Realtime and WhatsApp messages.

### 6.4 Payment

- **Phase 1:** Cash on Delivery. The delivery agent marks 'cash collected' in the staff panel, which writes the payment record.
- **Phase 2:** Pay through the WhatsApp invoice link (see section 9).

## 7. Order Lifecycle (State Machine)

| Status | Triggered by | Customer sees |
| --- | --- | --- |
| `pickup_requested` | User submits booking | Pickup Scheduled |
| `agent_assigned` | Auto or manual assignment | Agent Assigned |
| `picked_up` | Agent/staff | Picked Up |
| `under_analysis` | Admin/staff at store | In Process |
| `invoice_sent` | Admin generates invoice and sends WhatsApp link | Invoice Sent |
| `payment_pending` / `paid` | Phase 2 gateway webhook | Payment Confirmed |
| `in_process` | Staff | In Process |
| `ready_for_delivery` | Staff | Ready |
| `out_for_delivery` | Agent | Out for Delivery |
| `delivered` | Agent (COD cash recorded here in Phase 1) | Delivered |
| `cancelled` | Admin or user (before pickup) | Cancelled |

Every transition is written to `order_status_history` (who, when, from, to). Allowed transitions are enforced in a database function so invalid jumps are rejected. **Automatic updates** come from events (payment webhook marks paid, assignment marks agent\_assigned); **manual updates** come from admin and staff buttons.

## 8. Admin Panel

1. **Dashboard and analytics:** Orders today, pending pickups, revenue, orders by status, slot utilization, agent workload, top services, repeat customers.
2. **Customer profiles:** Every sign-up is stored automatically; view order history, addresses, notes.
3. **Pickup management:** All pickup requests with details, distance, slot, and photos. **Agent assignment:**
   - *Automatic:* choose an agent who is active, has no overlapping job in that slot, covers that locality/zone, and has the lowest current load.
   - *Manual:* admin overrides and reassigns from a dropdown of free agents.
   - Every assignment is saved in `pickup_assignments`.
4. **Product analysis and billing:** Admin records items received (type, quantity, service, notes, photos), prices are pulled from the live price list, and an invoice is generated (items, tax, discount, delivery charge, total).
5. **Invoice delivery:** Invoice is sent to the customer's **WhatsApp number** with a secure link to `/pay/[token]`. Phase 1 shows the invoice with COD; Phase 2 shows the gateway checkout.
6. **Order updates:** Manual status change plus automatic updates from system events.
7. **Notifications:** Template-based WhatsApp messages, OTP generation/resend logs, delivery status, failure retries, and a message log per customer.
8. **Delivery management:** Delivery assignment, status, proof of delivery, COD collected.
9. **Sales reports:** Daily, weekly, monthly sales by service, payment mode, and agent; export to CSV.
10. **Time slot settings:** Working hours, break (2 PM to 3 PM), capacity per slot, holiday/blocked dates. When a slot reaches capacity it is marked full and the user only sees the next available slots.
11. **Walk-in customer management:** Create a customer (name and mobile), add an order manually, generate a bill, and tag the order source as `walk_in`. Walk-ins are included in sales and notifications.
12. **Staff and agent management:** Create staff accounts, set roles, mark agents active, assign zones.
13. **Service and price list, hero slides, store settings:** Editable without developer help.

## 9. Billing and Payment Flow

1. Admin finalizes the invoice → row in `invoices`, status `sent`.
2. System creates a signed payment token and queues a WhatsApp message: 'Your invoice of ₹X is ready. Pay here: link'.
3. Customer taps the link → `/pay/[token]` shows invoice summary.
4. **Phase 2:** The page creates a gateway order (Razorpay) and opens checkout (UPI, cards, netbanking, wallets).
5. Gateway sends a **webhook** to `/api/webhooks/payments`. The server verifies the signature, records the payment (idempotent on gateway payment id), marks the invoice paid, moves the order to `paid`, and queues the confirmation WhatsApp: 'Payment received. Your items will be delivered in your selected slot.'
6. Never trust the browser redirect alone; only the verified webhook confirms payment.

## 10. Staff Panel

- **Pickup details:** Today's assigned pickups with customer name, phone, address, map link, slot, notes.
- **Delivery details:** Assigned deliveries with the same information and a navigation link.
- **Order updating:** Buttons for permitted status transitions only; upload pickup photos; mark delivered; record COD cash.
- **Bill details:** View invoices and payment records (read-only for most staff; created from payments, not editable).
- Staff see only orders assigned to them (or all, if given the 'store staff' role), enforced by RLS.

## 11. Database Design (Supabase Postgres)

| Table | Key columns |
| --- | --- |
| `profiles` | id (= auth user id), full\_name, mobile, email, role (customer/staff/admin), is\_active |
| `addresses` | id, user\_id, label, address\_text, lat, lng, distance\_km, is\_default |
| `services` | id, name, description, unit, price, is\_active, sort\_order |
| `hero_slides` | id, title, image\_url, link, sort\_order, is\_active |
| `store_settings` | store lat/lng, address, whatsapp\_number, max\_radius\_km (6), working hours |
| `time_slots` | id, start\_time, end\_time, capacity, is\_active |
| `slot_bookings` | id, slot\_date, slot\_id, order\_id (unique per date + slot + order); count compared with capacity |
| `blocked_dates` | date, reason |
| `orders` | id, order\_no, customer\_id, source (online/walk\_in), address snapshot, lat/lng, distance\_km, pickup\_slot, delivery\_slot, status, payment\_mode, accepted\_zone\_notice\_at, created\_by |
| `order_items` | id, order\_id, service\_id, item\_name, qty, unit\_price, notes, photo\_url |
| `order_status_history` | id, order\_id, from\_status, to\_status, changed\_by, note, created\_at |
| `agents` | id (profile id), zone, is\_available, current\_load, vehicle |
| `pickup_assignments` | id, order\_id, agent\_id, type (pickup/delivery), assigned\_by (auto/manual + user), status, assigned\_at |
| `invoices` | id, order\_id, invoice\_no, subtotal, tax, discount, total, status, pay\_token, sent\_at, paid\_at |
| `payments` | id, invoice\_id, mode (cod/upi/card/netbanking/wallet), gateway\_payment\_id, amount, status, collected\_by, created\_at |
| `notifications` | id, user\_id, channel, template, payload, status, provider\_message\_id, attempts, created\_at |
| `otp_logs` | id, mobile, purpose, sent\_at, verified\_at (supports rate limiting and audit) |
| `audit_logs` | id, actor\_id, action, entity, entity\_id, created\_at |

**Important database logic**

- A SQL function `book_pickup(...)` runs in one transaction: locks the slot row, checks capacity, inserts order, items and slot booking. This prevents two users taking the last slot at the same time.
- A trigger writes `order_status_history` on every status change and inserts notification rows.
- Indexes on `orders(status, created_at)`, `orders(customer_id)`, `slot_bookings(slot_date, slot_id)`, `notifications(status)`.

## 12. Security and Access Control

- **Roles:** customer, staff, admin stored in `profiles.role`; checked in Next.js middleware and again in RLS policies.
- **RLS examples:** customers read and write only their own profile, addresses and orders; staff read orders assigned to them and update status; admins have full access; `services`, `hero_slides` and available slots are publicly readable.
- The Supabase **service role key** is used only on the server (Vercel environment variables), never in browser code.
- Rate-limit OTP requests (per mobile and per IP), limit retries, and expire OTPs in a few minutes.
- Verify webhook signatures (payment and WhatsApp), and make webhook handlers idempotent.
- Payment tokens are signed, long, expiring, and single-invoice scoped.
- Restrict the Google Maps API key by HTTP referrer (browser key) and a separate server key for the distance API.
- Keep audit logs for admin actions such as price edits, reassignments and manual status changes.

## 13. Notifications

All messages go through a **queue**: events insert into `notifications`; a worker (Supabase Edge Function or Vercel Cron) sends and retries failures, and webhooks update delivery status.

**WhatsApp templates to get approved by Meta (apply early, approval takes time):**

- Order confirmed / pickup scheduled
- Agent assigned and on the way
- Picked up
- Invoice ready with payment link
- Payment received and delivery slot confirmation
- Out for delivery
- Delivered
- OTP (authentication template)

Fallback to SMS if WhatsApp fails.

## 14. Deployment on Vercel

- Git repository with `main` (production) and feature branches (preview deployments).
- Two Supabase projects: **staging** and **production**, each with its own environment variables.
- Environment variables: Supabase URL and keys, Google Maps keys, WhatsApp token and phone id, SMS provider keys, payment keys and webhook secret, payment-token signing secret.
- Database migrations kept in the repo (Supabase CLI) and applied through CI.
- Vercel Cron for periodic jobs (retry notifications, send slot reminders, auto-close past slots).
- Webhooks need a stable production URL; configure after the domain is connected.
- Add error monitoring (Sentry) and Vercel Analytics, and enable Supabase backups.
- Note: keep API routes fast; long jobs go to Supabase Edge Functions rather than Vercel functions.

## 15. Development Roadmap

| Milestone | Deliverables |
| --- | --- |
| 1. Foundation | Repo, Supabase schema, RLS, auth with OTP, roles |
| 2. Public site | Home page (hero carousel, About, Services, Why UClean, Contact, Footer), Book Now page |
| 3. User booking | Wizard, 6 km check, slot booking, order creation, tracking page |
| 4. Admin core | Customers, pickups, assignment (auto and manual), order updates, slot settings |
| 5. Staff panel | Pickup/delivery lists, status updates |
| 6. Billing and WhatsApp | Invoice generation, WhatsApp templates and queue, COD flow |
| 7. Walk-in, sales and analytics | Walk-in orders, reports, dashboard |
| 8. Testing and launch | UAT, security review, production deploy |
| Phase 2 | Payment gateway, new hero cards, refinements |

## 16. Decisions to Confirm

1. Delivery agents: are they the same people as staff users, or a separate role? (Design assumes agents are staff with an agent profile.)
2. Slot capacity: how many pickups per hourly slot?
3. Is the 6 km measured from a single store location? Confirm the exact coordinates.
4. Which WhatsApp provider will you use (Meta Cloud API direct or a provider)? Template approval can take several days.
5. Which payment gateway for Phase 2 (Razorpay recommended)?
6. Should the delivery slot be chosen by the customer at booking, or set by admin after the bill is ready? The current design lets the customer choose the pickup slot and the admin or customer confirm the delivery slot.
7. Tax (GST) and invoice numbering requirements.
