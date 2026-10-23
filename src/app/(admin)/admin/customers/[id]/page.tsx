import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  CalendarDays,
  Hash,
  Mail,
  MapPin,
  MessageCircle,
  Package,
  Phone,
  UserRound,
} from "lucide-react";

import { PanelPage } from "@/components/panel/panel-page";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/db/server";
import { getAdminCustomerDetail } from "@/db/queries/admin-customers";
import { INTERNAL_STATUS_LABEL } from "@/lib/order-status";
import { requireAdmin } from "@/server/auth";
import { formatDate, formatDateTime } from "@/lib/utils";

import {
  FactTile,
  SectionCard,
  StatusPill,
} from "../../../_components/booking-detail-cards";

export const metadata: Metadata = { title: "Customer" };

/**
 * One customer in full (architecture doc, section 7.2.2).
 *
 * Profile details, the addresses they have saved, and every booking they have
 * placed. Read-only: the panel can look at a customer but not change them, which
 * is also what the database enforces — `profiles_update_self` allows a profile
 * row to be edited only by its owner, so an admin edit would need a policy
 * change rather than a form.
 *
 * The booking history links into the bookings module rather than re-implementing
 * it, so "what have they booked" and "what is happening with it" are one hop
 * apart and cannot disagree.
 *
 * A missing customer is a 404 with no explanation, so this screen cannot be used
 * to discover whether an id exists.
 */
export default async function AdminCustomerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireAdmin();

  const supabase = await createClient();

  const customer = await getAdminCustomerDetail(supabase, id).catch(
    (error: unknown) => {
      console.error("Could not load the customer", error);
      return null;
    },
  );

  if (!customer) notFound();

  const { profile, addresses, orders, summary } = customer;

  return (
    <PanelPage
      title={profile.full_name}
      description={`Customer since ${formatDate(profile.created_at)}`}
      action={
        <Link
          href="/admin/customers"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm font-medium underline-offset-4 hover:underline"
        >
          <ArrowLeft className="size-4" aria-hidden />
          All customers
        </Link>
      }
    >
      <div className="space-y-6">
        {/* The hero: who this is and how to reach them, before anything is
            opened, so the page has one obvious starting point. */}
        <section className="bg-card overflow-hidden rounded-xl border shadow-sm">
          <div className="bg-muted/40 flex flex-wrap items-center gap-4 border-b px-6 py-5">
            <Avatar size="lg">
              <AvatarFallback>{initialsOf(profile.full_name)}</AvatarFallback>
            </Avatar>

            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2.5">
                <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">
                  {profile.full_name}
                </h2>

                {profile.is_active ? (
                  <Badge variant="success">Active account</Badge>
                ) : (
                  <Badge variant="secondary">Inactive account</Badge>
                )}
              </div>

              <p className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <span className="inline-flex items-center gap-1.5">
                  <Phone className="size-3.5" aria-hidden />
                  {profile.mobile}
                </span>
                {profile.whatsapp_number ? (
                  <span className="inline-flex items-center gap-1.5">
                    <MessageCircle className="size-3.5" aria-hidden />
                    {profile.whatsapp_number}
                  </span>
                ) : (
                  <span className="text-xs">No WhatsApp number on file</span>
                )}
              </p>
            </div>
          </div>

          <div className="grid gap-3 px-6 py-5 sm:grid-cols-2 xl:grid-cols-4">
            <FactTile
              icon={Package}
              label="Bookings"
              value={summary.total}
              hint={summary.total === 0 ? "Nothing placed yet" : "All time"}
            />

            <FactTile
              icon={CalendarDays}
              label="Still open"
              value={summary.open}
              hint="Placed, not yet delivered or cancelled"
            />

            <FactTile
              icon={CalendarDays}
              label="Delivered"
              value={summary.delivered}
              hint="Finished and handed over"
            />

            <FactTile
              icon={CalendarDays}
              label="Last booking"
              value={formatDate(summary.lastOrderAt)}
              hint={summary.lastOrderAt ? "Most recent" : "No bookings yet"}
            />
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
          {/* Working column: the order history the doc asks for. */}
          <div className="space-y-6">
            <SectionCard
              icon={Package}
              title="Order history"
              description="Every booking this customer has placed, newest first. Opens the full booking record."
            >
              {orders.length === 0 ? (
                <div className="border-border rounded-lg border border-dashed px-4 py-10 text-center">
                  <p className="text-sm font-medium">No bookings yet</p>
                  <p className="text-muted-foreground mx-auto mt-1 max-w-sm text-sm">
                    This account was created, but no pickup has been booked
                    against it.
                  </p>
                </div>
              ) : (
                <ul className="space-y-2">
                  {orders.map((order) => (
                    <li key={order.id}>
                      <Link
                        href={`/admin/bookings/${order.id}`}
                        className="bg-muted/30 hover:bg-muted/60 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg border px-3 py-2.5 transition-colors"
                      >
                        <span className="font-mono text-sm font-medium underline-offset-4 hover:underline">
                          {order.order_no}
                        </span>

                        <span className="flex flex-wrap items-center gap-2">
                          <StatusPill
                            status={order.status}
                            label={INTERNAL_STATUS_LABEL[order.status]}
                          />
                        </span>

                        {/* min-w-0 on the wrapper span: the truncate inside
                            never engaged without it, so a long slot label
                            pushed the row (and the page) wide. */}
                        <span className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-xs">
                          <CalendarDays
                            className="size-3.5 shrink-0"
                            aria-hidden
                          />
                          Pickup {formatDate(order.pickup_slot_date)}
                          <span className="truncate">
                            {order.slotLabel ?? ""}
                          </span>
                        </span>

                        <span className="text-muted-foreground text-xs">
                          Placed {formatDate(order.created_at)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>

            <SectionCard
              icon={MapPin}
              title="Saved addresses"
              description="Where this customer asks to be collected from."
            >
              {addresses.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  No addresses saved to this account yet.
                </p>
              ) : (
                <ul className="space-y-2">
                  {addresses.map((address) => (
                    <li
                      key={address.id}
                      className="border-border rounded-lg border px-3 py-2.5"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">
                          {address.label}
                        </span>
                        {address.is_default ? (
                          <Badge variant="outline">Default</Badge>
                        ) : null}
                      </div>

                      <p className="text-muted-foreground mt-1 text-sm">
                        {address.address_text}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
          </div>

          {/* Side column: how to reach them, then the reference identifiers. */}
          <div className="space-y-6">
            <SectionCard
              icon={UserRound}
              title="Contact"
              description="Read from the live profile, so an edit here would show everywhere."
            >
              <dl className="space-y-3 text-sm">
                <Row label="Name">{profile.full_name}</Row>

                <Row label="Mobile">
                  <a
                    href={`tel:${profile.mobile}`}
                    className="inline-flex items-center gap-1.5 underline-offset-4 hover:underline"
                  >
                    <Phone className="size-3.5" aria-hidden />
                    {profile.mobile}
                  </a>
                </Row>

                <Row label="WhatsApp">
                  {profile.whatsapp_number ? (
                    <a
                      href={`https://wa.me/${profile.whatsapp_number.replace(/\D/g, "")}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 underline-offset-4 hover:underline"
                    >
                      <MessageCircle className="size-3.5" aria-hidden />
                      {profile.whatsapp_number}
                    </a>
                  ) : (
                    <span className="text-muted-foreground">
                      Not set on this account
                    </span>
                  )}
                </Row>

                <Row label="Email">
                  {profile.email ? (
                    // An email has no natural break points; a long one
                    // overflowed the narrow fact column otherwise.
                    <span className="inline-flex min-w-0 items-start gap-1.5 break-all">
                      <Mail className="size-3.5 shrink-0" aria-hidden />
                      {profile.email}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Not set</span>
                  )}
                </Row>
              </dl>
            </SectionCard>

            {/* The two identifiers nobody reads first, kept out of the way. */}
            <SectionCard
              icon={Hash}
              title="Reference"
              description="Internal identifiers, for support and for logs."
            >
              <dl className="space-y-3 text-sm">
                <Row label="Customer ID">
                  <span className="text-muted-foreground font-mono text-xs break-all">
                    {profile.id}
                  </span>
                </Row>
                <Row label="Role">
                  <span className="capitalize">{profile.role}</span>
                </Row>
                <Row label="Joined">{formatDateTime(profile.created_at)}</Row>
                <Row label="Last updated">
                  {formatDateTime(profile.updated_at)}
                </Row>
              </dl>
            </SectionCard>
          </div>
        </div>
      </div>
    </PanelPage>
  );
}

/**
 * A label and its value, stacked.
 *
 * The dt is the small muted line and the dd is the readable one, matching the
 * booking screen: on these panels the value is what is being read and the label
 * only has to be findable.
 */
function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}

/** Up to two letters for the avatar, from a name that may be a single word. */
function initialsOf(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}
