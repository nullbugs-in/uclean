import {
  CircleAlert,
  CircleCheck,
  Mail,
  MessageCircle,
  Phone,
  ShieldCheck,
  UserRound,
} from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { AppRole, Profile } from "@/db/types";
import { formatDate, formatDateTime } from "@/lib/utils";

/**
 * The signed-in staff member's or admin's own account, inside their own panel.
 *
 * This exists because "My account" used to point at `/account`, a stub left
 * over from the removed customer dashboard that redirects to the home page. The
 * alternative - sending staff and admin out to the customer account module -
 * is worse than a dead link: that page greets everyone as "Customer since" and
 * shows saved addresses to someone who will never book a pickup.
 *
 * Read-only by design. An admin editing their own permissions from inside the
 * panel whose access those permissions grant is a bad shape, and role changes
 * belong on the users screen where someone else can see who made them. Name and
 * mobile stay as they are: both are identity here, and the mobile is the login
 * identity, so neither is casually editable.
 */

const ROLE_LABEL: Record<AppRole, string> = {
  customer: "Customer",
  staff: "Staff",
  admin: "Admin",
};

function initials(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();

  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export function PanelProfile({ profile }: { profile: Profile }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-3">
          <Avatar className="size-12">
            <AvatarFallback className="text-sm font-semibold">
              {initials(profile.full_name)}
            </AvatarFallback>
          </Avatar>

          <div className="min-w-0">
            <CardTitle>{profile.full_name}</CardTitle>
            <CardDescription>
              {ROLE_LABEL[profile.role]} since {formatDate(profile.created_at)}
            </CardDescription>
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{ROLE_LABEL[profile.role]}</Badge>

            {profile.is_active ? (
              <Badge variant="outline" className="gap-1 text-[var(--primary)]">
                <CircleCheck className="size-3" aria-hidden="true" />
                Active
              </Badge>
            ) : (
              <Badge variant="outline" className="text-destructive gap-1">
                <CircleAlert className="size-3" aria-hidden="true" />
                Deactivated
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2 xl:grid-cols-3">
          <Detail
            icon={<Phone className="size-4" aria-hidden="true" />}
            label="Mobile"
            value={profile.mobile}
          />
          <Detail
            icon={<Mail className="size-4" aria-hidden="true" />}
            label="Email"
            value={profile.email ?? "Not set"}
            muted={!profile.email}
          />
          <Detail
            icon={<MessageCircle className="size-4" aria-hidden="true" />}
            label="WhatsApp"
            value={profile.whatsapp_number ?? "Not set"}
            muted={!profile.whatsapp_number}
          />

          {/*
            Worth its own line because it changes what the rest of the panel
            shows: with this set, the order book below is the whole service
            rather than only what this person is assigned.
          */}
          <Detail
            icon={<ShieldCheck className="size-4" aria-hidden="true" />}
            label="Order visibility"
            value={
              profile.can_view_all_orders
                ? "Every order in the service"
                : "Only orders assigned to them"
            }
          />

          <Detail
            icon={<UserRound className="size-4" aria-hidden="true" />}
            label="User ID"
            value={profile.id}
          />
          <Detail
            icon={<UserRound className="size-4" aria-hidden="true" />}
            label="Last updated"
            value={formatDateTime(profile.updated_at ?? profile.created_at)}
          />
        </dl>
      </CardContent>
    </Card>
  );
}

function Detail({
  icon,
  label,
  value,
  muted = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="flex items-start gap-3">
      <span
        aria-hidden="true"
        className="bg-muted text-muted-foreground mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg"
      >
        {icon}
      </span>
      <div className="min-w-0">
        <dt className="text-muted-foreground text-xs tracking-wide uppercase">
          {label}
        </dt>
        <dd
          className={
            muted ? "text-muted-foreground text-sm" : "text-sm font-medium"
          }
        >
          {value}
        </dd>
      </div>
    </div>
  );
}
