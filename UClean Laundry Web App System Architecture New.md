# UClean Laundry Pickup & Delivery Web App: System Architecture

Prepared for: Moideen E M | Prepared by: Null Bugs | Stack: Next.js, Supabase, Vercel

## 1. Overview

UClean is a mobile-friendly web platform with three surfaces on one codebase: a public website plus customer panel, a staff panel and an admin panel. Customers book a pickup only if their address is within 6 km of driving distance from the store. Admin inspects the items, generates a bill and sends it over WhatsApp. The customer opens the link, confirms the bill, picks a delivery slot and pays (Cash on Delivery in Phase 1, payment gateway in Phase 2). Staff and delivery agents update order status until delivery.

**Phase 1:** public site, sign up with OTP, pickup booking with 6 km check, admin and staff panels, billing, WhatsApp invoice link, slot management, Cash on Delivery, order tracking.

**Phase 2:** online payments (UPI, cards, netbanking, wallets), new poster cards on the home page, smarter agent routing, richer analytics.

## 2. Recommended Tech Stack

| Layer | Choice | Why |
| --- | --- | --- |
| Frontend and backend | Next.js (App Router) with TypeScript | One codebase for pages, server actions and API routes; deploys natively on Vercel |
| UI | Tailwind CSS and shadcn/ui | Fast, consistent, mobile-first |
| Database | Supabase PostgreSQL | Relational data suits orders, slots and billing |
| Auth | Supabase Auth (phone OTP) plus role field | Customers sign up with name and mobile number |
| Realtime | Supabase Realtime | Live order status for customers, new-pickup alerts for admin and staff |
| File storage | Supabase Storage | Item photos taken at pickup, invoice PDFs |
| Distance check | Google Maps Platform (Routes API or Distance Matrix, Places Autocomplete, Maps JS) | Real driving distance, not straight-line |
| WhatsApp and OTP | WhatsApp Business Cloud API (Meta) or a BSP such as Gupshup, Twilio or MSG91; SMS OTP via MSG91 or Twilio | Template messages with invoice links; OTP delivery |
| Payments (Phase 2) | Razorpay (or Cashfree / PhonePe PG) | UPI, cards, netbanking, wallets, plus webhooks |
| Scheduled jobs | Vercel Cron and Supabase pg\_cron | Slot generation, reminders, auto-assignment retries |
| Hosting | Vercel (frontend and serverless functions), Supabase cloud (data) | As planned |

## 3. High-Level Architecture

```
Customer / Staff / Admin browsers (mobile and desktop)
            |
            v
   Vercel: Next.js app (pages, server actions, API routes, middleware)
     |-- /(public)    home, book-now, login
     |-- /app         customer panel
     |-- /staff       staff panel
     |-- /admin       admin panel
     |-- /api         webhooks (WhatsApp, payments), cron endpoints, distance check
            |
   +--------+-----------+-------------------+------------------+
   |                    |                   |                  |
   v                    v                   v                  v
Supabase            Google Maps        WhatsApp / SMS     Payment gateway
(Postgres, Auth,    (distance,         provider           (Phase 2)
Realtime, Storage)  places, maps)      (OTP, invoices,
                                       status updates)
```

Rules that keep this safe and simple:

- The browser talks to Supabase only for reads protected by Row Level Security (RLS) and for realtime. All sensitive writes (booking, billing, assignment, payment) go through Next.js server actions or API routes.
- API keys for Google distance, WhatsApp, SMS and payments, and the Supabase service-role key, live only in Vercel environment variables and are never sent to the browser.
- Roles (customer, staff, admin) are enforced in three places: Next.js middleware (route access), server-side checks (actions) and Postgres RLS (data access).

## 4. Public Website

### 4.1 Home page sections (in order)

1. **Header:** logo, links (About, Services, Why UClean, Contact), Login / Sign up.
2. **Hero:** a slider with 3 poster slides: Express Service, Shoe Cleaning, Curtain Cleaning. Two buttons: **Services** (scrolls to the services section) and **Book Now** (goes to /book-now).
3. **About:** short story of the store.
4. **Services:** cards for each service with starting price from the live price list.
5. **Why UClean:** 4 to 6 value points (pickup and delivery, express turnaround, tracking, secure payment, etc.).
6. **Contact:** store address, Google Map embed of the store location, **Chat on WhatsApp** button (wa.me link), phone number.
7. **Footer:** links, social icons, copyright.

**Extensibility for Phase 2:** hero slides are stored in a `hero_slides` table (image, title, link, sort order, active flag). The admin adds new cards later without a code change. Service cards likewise come from the `services` table.

### 4.2 Book Now page

A public page that explains the 4 steps and ends with a **Book Now** button:

- Step 1: location within 6 km driving distance.
- Step 2: OTP verification.
- Step 3: slot booking (hourly, 10 AM to 2 PM and 3 PM to 8 PM).
- Step 4: order updates.

Clicking **Book Now** sends the visitor to sign up or login. If they are already logged in, they go directly to the pickup form in the customer panel. After login the user returns to where they were (a `redirectTo` parameter).

## 5. Authentication and Roles

**Sign up:** name and mobile number, then OTP sent to the mobile number, then verify, then account created. Supabase Auth handles phone OTP with an SMS provider. In India, SMS requires DLT registration (sender ID and templates). WhatsApp OTP is an alternative if SMS is a problem; it can be built as a custom OTP table with hashed codes, 5-minute expiry and attempt limits.

**Login:** mobile number then OTP.

**Roles:** stored in `profiles.role` with values customer, staff, admin. Staff and admin accounts are created by the admin (invite flow), never through public sign up. Middleware redirects each role to its own panel.

**Abuse protection:** rate limit OTP requests per number and per IP, lock after repeated wrong attempts, and add a CAPTCHA on the OTP request.

## 6. Core Business Logic

### 6.1 Serviceability check (6 km driving distance)

1. The customer enters an address (Places Autocomplete) or drops a pin on the map. The app captures latitude and longitude.
2. A server API route calls Google Routes API (or Distance Matrix) with the store as origin and the customer as destination, mode driving.
3. If distance is 6,000 m or less, the booking continues. Otherwise the user sees a friendly out-of-zone message.
4. The server stores the verified distance and coordinates on the order. The client's result is never trusted; the check is repeated on submit.
5. The store coordinates and the radius (6 km) are admin-configurable settings, so the zone can grow later.

Cost control: cache results by rounded coordinates and only call Google when the user confirms a location, not on every map drag.

### 6.2 Time slots

- **Fixed hourly slots:** 10-11, 11-12, 12-1, 1-2 and 3-4, 4-5, 5-6, 6-7, 7-8. That is 9 slots per day, with the 2 to 3 PM lunch break closed.
- The same slot structure is used for pickup and delivery, but capacity is tracked separately for each.
- The admin Slot Settings module controls: working days and holidays, which slots are open, **capacity per slot** (for example max pickups or deliveries per hour, or number of agents available) and a cut-off (no booking inside the next 60 minutes).
- **Auto-open of next slot:** the customer sees only slots that still have capacity. When a slot reaches capacity it becomes unavailable and the next free one is offered. A booking is created inside a database transaction that checks and increments `booked_count`, so two customers cannot take the last place at once.
- Slot rows are generated per date by a daily cron job (or on demand for the next 7 days).

### 6.3 Pickup assignment to delivery agents

Assignment can be **automatic** or **manual**, switchable by the admin.

**Automatic logic (Phase 1, locality-based):**

1. Filter agents who are active, on duty today, and below their slot capacity.
2. Prefer the agent already assigned to jobs in the same locality or pincode and the same slot.
3. Otherwise pick the agent with the lowest load.
4. Save the assignment with `assigned_by` (auto or admin user) and notify the agent through the staff panel realtime feed.

**Manual:** the admin sees the unassigned list and assigns or reassigns from a dropdown. Every change is logged in the status history.

**Nearby-agent optimisation (Phase 2):** staff log in on the phone and, while on duty, send their location to `agent_locations`. When a new delivery is scheduled, the system looks for an agent with a stop within a configurable distance (for example 1.5 km) in the same slot and assigns that delivery to the agent. Browser GPS is not reliable in the background, so Phase 1 uses the locality-based rule above, and a native or PWA wrapper can be considered if live tracking becomes critical.

### 6.4 Order status flow

```
PICKUP_REQUESTED -> PICKUP_ASSIGNED -> PICKED_UP -> IN_ANALYSIS -> BILL_SENT
   -> (customer confirms bill, chooses delivery slot, pays or selects COD)
   -> IN_PROCESS -> READY -> OUT_FOR_DELIVERY -> DELIVERED
(any stage -> CANCELLED, with reason)
```

Statuses are updated manually by admin and staff, and automatically by events: pickup scheduled (assignment), payment webhook (marks paid), delivery slot chosen (moves to IN\_PROCESS), and so on. Each change inserts a row in `order_status_history` (who, when, from, to), which feeds the customer tracking timeline and the audit trail. Each status change can trigger a WhatsApp notification.

### 6.5 Billing and invoice

1. At the store, admin or staff open the order, add line items from the price list (service, quantity, rate, discount) and notes or photos of item condition.
2. The system calculates subtotal, GST (if applicable), delivery charge and total, and generates an invoice number (for example UC-2026-000123).
3. A PDF invoice is generated and stored in Supabase Storage.
4. The system sends a WhatsApp template message to the customer's WhatsApp number containing a secure link such as `/pay/<signed-token>`.
5. The link opens a checkout page (no login required beyond the signed token, plus OTP re-check for safety) showing the bill, the delivery slot picker and the payment choice.

**Phase 1:** the customer reviews the bill, selects a delivery slot and chooses Cash on Delivery. Staff mark the payment as collected on delivery, and the bill record is saved against the order.

**Phase 2:** the same page shows Razorpay checkout (UPI, cards, netbanking, wallets). A **webhook** (signature verified) marks the invoice paid; the browser redirect is never treated as proof of payment. Delivery slot selection happens after successful payment, as per your workflow.

### 6.6 Notifications

| Event | Channel | Recipient |
| --- | --- | --- |
| OTP | SMS or WhatsApp | Customer |
| Pickup confirmed with slot | WhatsApp | Customer |
| Agent assigned | Panel realtime | Agent |
| Picked up | WhatsApp | Customer |
| Invoice with payment link | WhatsApp | Customer |
| Payment received | WhatsApp | Customer |
| Out for delivery | WhatsApp | Customer |
| Delivered | WhatsApp | Customer |
| New pickup request | Panel realtime | Admin and staff |

WhatsApp business-initiated messages must use **pre-approved templates**, so template approval from Meta should start early. All sent messages are logged in `notifications` with delivery status, so the admin can resend any message.

### 6.7 Profile data stays in sync

Name and mobile number are stored once in `profiles`. Every form (pickup, billing, notifications) reads from there and pre-fills the values, so an edit in the profile shows up everywhere. Orders keep a **snapshot** of the address and contact used at booking time so old invoices do not change, while the live name and phone are always read from the profile.

## 7. Panels and Features

### 7.1 Customer panel

- Sign up, login (OTP), profile edit (name, mobile, email, saved addresses).
- Book pickup: shows a **pop-up** that pickup is available only within 6 km driving distance, requires acceptance, and then opens the form with name, address, email, WhatsApp number and map location (all pre-filled where known). The distance check runs, the pickup slot is chosen, and the request is submitted. It appears instantly in the admin and staff dashboards.
- Choose delivery slot (from the WhatsApp bill link or from the order page).
- Orders list and live tracking timeline (realtime).
- Invoices and payment history.

### 7.2 Admin panel

1. **Dashboard:** platform-wide analytics (orders today, revenue, pending pickups, deliveries, top services, slot utilisation, agent performance).
2. **Customers:** profile details, order history, auto-saved on sign up.
3. **Pickups:** all requests, pickup details, assign agent (automatic or manual), reassign.
4. **Orders:** analyze items, update status manually, see automatic status log.
5. **Billing:** generate bill from price list, send invoice via WhatsApp, track paid and unpaid.
6. **Deliveries:** delivery details, assignments, nearby-agent suggestions.
7. **Notifications:** WhatsApp and OTP management, templates, resend, message log.
8. **Slot settings:** capacity, holidays, open and closed slots, automatic next-slot availability.
9. **Walk-in management:** create customers and orders manually for people who visit the store, with the same billing and status flow.
10. **Sales:** daily, weekly, monthly sales, payment mode split, export to CSV.
11. **Catalog and content:** service price list, hero slides, store details, service radius.
12. **Staff management:** create staff and agents, roles, duty status.

### 7.3 Staff panel

- **Pickup details:** assigned pickups with address, map link, customer contact, slot.
- **Delivery details:** assigned deliveries with the same information.
- **Order updates:** change status per allowed transitions (cannot edit prices or sales reports).
- **Bill details:** view bills, mark COD collected; payment records are saved against the order and visible to admin.
- Mobile-first layout, large buttons and call or navigate shortcuts, because agents use it on the road.

## 8. Database Design (Supabase Postgres)

| Table | Key fields |
| --- | --- |
| profiles | id (auth user id), name, mobile, whatsapp\_number, email, role, is\_active, created\_at |
| addresses | id, user\_id, label, address\_text, lat, lng, distance\_m, is\_default |
| services | id, name, description, unit, price, is\_active |
| hero\_slides | id, image\_url, title, link, sort\_order, is\_active |
| slots | id, date, start\_time, end\_time, type (pickup/delivery), capacity, booked\_count, is\_open |
| orders | id, order\_no, customer\_id, source (online/walk\_in), status, pickup\_address\_snapshot, lat, lng, distance\_m, pickup\_slot\_id, delivery\_slot\_id, pickup\_agent\_id, delivery\_agent\_id, created\_by, created\_at |
| order\_items | id, order\_id, service\_id, description, qty, rate, discount, amount, photo\_url |
| invoices | id, invoice\_no, order\_id, subtotal, tax, delivery\_charge, total, status, pdf\_url, payment\_token, sent\_at |
| payments | id, invoice\_id, method (cod/online), gateway\_ref, amount, status, collected\_by, paid\_at |
| order\_status\_history | id, order\_id, from\_status, to\_status, changed\_by, source (manual/auto), note, created\_at |
| assignments | id, order\_id, agent\_id, kind (pickup/delivery), assigned\_by, mode (auto/manual), status |
| agent\_locations | agent\_id, lat, lng, updated\_at (Phase 2) |
| notifications | id, user\_id, channel, template, payload, status, provider\_msg\_id, sent\_at |
| otp\_codes | id, mobile, code\_hash, purpose, expires\_at, attempts (only if custom OTP is used) |
| settings | key, value (store location, radius\_m, working hours, auto\_assign flag, cut-off minutes) |
| audit\_logs | id, actor\_id, action, entity, entity\_id, meta, created\_at |

Important database rules:

- Indexes on `orders(status)`, `orders(customer_id)`, `slots(date, type)` and `assignments(agent_id, status)`.
- Store money as integer paise or numeric(12,2), never float.
- Unique constraint on `invoice_no` and `order_no`, generated from a sequence.
- **RLS policies:** customers read and write only their own rows; staff read only orders assigned to them and may update status; admin full access; service role used only on the server.

## 9. Suggested Project Structure

```
/app
  /(public)        page.tsx (home), book-now, login, pay/[token]
  /app             customer panel: book, orders, profile
  /staff           pickups, deliveries, orders, bills
  /admin           dashboard, customers, pickups, orders, billing,
                   deliveries, notifications, slots, walk-in, sales,
                   catalog, staff
  /api
    /distance      serviceability check
    /webhooks      whatsapp, payments
    /cron          generate-slots, reminders, auto-assign
/lib               supabase clients, auth guards, pricing, slots, assignment
/components        ui, forms, maps, status timeline
/supabase          migrations, RLS policies, seed data
middleware.ts      role-based route protection
```

## 10. Deployment on Vercel

- **Environments:** local, preview (per pull request, with a separate Supabase project for staging) and production.
- **Environment variables:** Supabase URL, anon key and service-role key (server only), Google Maps keys (a browser key restricted by HTTP referrer and a server key restricted for Routes API), WhatsApp token and phone number ID, SMS provider key, payment keys and webhook secret (Phase 2).
- **Cron:** `vercel.json` schedules slot generation and reminders. Note that Vercel cron frequency depends on your plan.
- **Webhooks:** public API routes for WhatsApp and payments with signature verification and idempotency (ignore duplicate events).
- **Database changes:** versioned SQL migrations through Supabase CLI, applied in staging before production.
- **Region:** choose a Vercel function region and Supabase region close to India (for example Mumbai) to keep latency low.
- **Monitoring:** Vercel logs and analytics, Sentry for errors, Supabase backups enabled.

## 11. Security and Compliance Checklist

- RLS enabled on every table; no table is public.
- Server-side re-validation of distance, slot availability and prices; never trust the client.
- Payment link tokens are signed, expire and are single-invoice.
- Rate limiting on OTP and booking endpoints.
- Personal data (name, phone, address) is handled in line with India's DPDP Act: collect consent at sign up and provide a privacy policy.
- Audit log for admin actions (status override, price change, reassignment).

## 12. Delivery Roadmap

| Milestone | Scope |
| --- | --- |
| 1. Foundation | Next.js project, Supabase schema and RLS, auth with OTP, roles, design system |
| 2. Public site | Home page with 3-slide hero, About, Services, Why UClean, Contact with map and WhatsApp, footer, Book Now page |
| 3. Booking | Profile, 6 km check, pickup pop-up and form, slots, realtime to admin and staff |
| 4. Admin and staff | Pickups, assignment (auto and manual), orders and status, staff panel |
| 5. Billing | Bill generation, PDF, WhatsApp invoice link, checkout page with delivery slot and COD |
| 6. Operations | Slot settings, walk-in orders, sales and analytics, notification management |
| 7. Launch | Testing, WhatsApp template approvals, DLT setup, production deploy on Vercel |
| 8. Phase 2 | Payment gateway, new hero cards, nearby-agent routing, advanced reports |

## 13. Assumptions and Points to Confirm

1. **Business setup:** WhatsApp Business API approval and template approval take time, so start them now. SMS in India needs DLT registration.
2. **Slot capacity:** confirm how many pickups and deliveries one hourly slot can handle.
3. **Delivery charge:** confirm whether delivery is free inside 6 km or charged.
4. **Order of payment and delivery slot:** in your flow the customer pays first and then chooses the delivery slot. For Phase 1 (Cash on Delivery) the customer confirms the bill and chooses the slot, and payment is collected at the door.
5. **Agent live tracking:** confirm whether locality-based assignment is acceptable for launch, with live GPS-based nearby assignment in Phase 2.
6. **Gateway choice:** Razorpay is suggested; confirm your preferred provider.
7. **GST:** confirm whether invoices must include GST.
