"use client";

import { useState, useTransition } from "react";
import { ShieldCheck, UserRound } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AppRole, Profile } from "@/db/types";

import {
  setStaffActiveAction,
  setStaffRoleAction,
  setStoreWideVisibilityAction,
} from "../admin/agents/actions";

const ROLES: Array<{ value: AppRole; label: string; hint: string }> = [
  { value: "customer", label: "Customer", hint: "Own bookings only" },
  { value: "staff", label: "Staff", hint: "The staff panel" },
  { value: "admin", label: "Admin", hint: "Everything" },
];

/**
 * The team list (section 8.12).
 *
 * Every staff and admin account, with the three things an admin is allowed to
 * change about one. Roles are exactly customer, staff and admin - there is no
 * fourth "store staff" role. What the architecture calls store staff is the
 * boolean `can_view_all_orders`, which the RLS policies read through
 * `is_store_staff()`, so the switch is the whole of that concept.
 *
 * Each control saves on its own, with no submit button, because there is no
 * coherent "save" for a row whose fields land in three different places. A
 * failure snaps the control back rather than leaving a state the store does not
 * have.
 */
export function StaffAccounts({
  members,
  currentUserId,
}: {
  members: Profile[];
  currentUserId: string;
}) {
  const [isPending, startTransition] = useTransition();
  const message = useNotice();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="size-4" aria-hidden />
          Team accounts
        </CardTitle>
        <CardDescription>
          Who can sign in, what they may reach, and who sees the whole order book.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        {message.text ? (
          <p
            role={message.error ? "alert" : "status"}
            className={message.error ? "text-destructive text-sm" : "text-muted-foreground text-sm"}
          >
            {message.text}
          </p>
        ) : null}

        {members.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            There are no staff accounts yet. Add an agent on the pickups page and
            it becomes one.
          </p>
        ) : (
          <ul className="divide-border divide-y">
            {members.map((member) => {
              const self = member.id === currentUserId;
              const canWiden = member.role === "staff";

              return (
                <li
                  key={member.id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-3 py-3"
                >
                  <span className="flex min-w-0 flex-1 items-center gap-2">
                    <UserRound className="text-muted-foreground size-4 shrink-0" aria-hidden />
                    <span className="min-w-0">
                      <span className="flex items-center gap-2 text-sm font-medium">
                        {member.full_name}
                        {self ? <Badge variant="outline">You</Badge> : null}
                      </span>
                      <span className="text-muted-foreground text-xs">{member.mobile}</span>
                    </span>
                  </span>

                  <span className="flex items-center gap-2">
                    <Select
                      value={member.role}
                      disabled={isPending}
                      onValueChange={(next) => {
                        message.clear();
                        startTransition(async () => {
                          const result = await setStaffRoleAction({
                            profileId: member.id,
                            role: next as AppRole,
                          });
                          message.set(result.ok, result.message ?? "Role updated.");
                        });
                      }}
                    >
                      <SelectTrigger size="sm" className="w-32" aria-label={`Role for ${member.full_name}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ROLES.map((role) => (
                          <SelectItem key={role.value} value={role.value}>
                            {role.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </span>

                  <label className="flex items-center gap-2 text-sm">
                    <Switch
                      size="sm"
                      checked={member.is_active}
                      disabled={isPending}
                      onCheckedChange={(next) => {
                        message.clear();
                        startTransition(async () => {
                          const result = await setStaffActiveAction({
                            profileId: member.id,
                            isActive: next,
                          });
                          message.set(result.ok, result.message ?? "Saved.");
                        });
                      }}
                      aria-label={`${member.is_active ? "Deactivate" : "Activate"} ${member.full_name}`}
                    />
                    <span className="text-muted-foreground">Active</span>
                  </label>

                  <label className="flex items-center gap-2 text-sm">
                    <Switch
                      size="sm"
                      checked={member.can_view_all_orders}
                      disabled={isPending || !canWiden}
                      onCheckedChange={(next) => {
                        message.clear();
                        startTransition(async () => {
                          const result = await setStoreWideVisibilityAction({
                            profileId: member.id,
                            canViewAllOrders: next,
                          });
                          message.set(result.ok, result.message ?? "Visibility updated.");
                        });
                      }}
                      aria-label={`Store-wide visibility for ${member.full_name}`}
                    />
                    <span className="text-muted-foreground">Sees everything</span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * One line of feedback for the whole list.
 *
 * The controls are spread across the page, so a message that lived inside one
 * row would be off screen by the time it mattered.
 */
function useNotice() {
  const [state, setState] = useState<{ text: string | null; error: boolean }>({
    text: null,
    error: false,
  });

  return {
    text: state.text,
    error: state.error,
    clear: () => setState({ text: null, error: false }),
    set: (ok: boolean, text: string) => setState({ text, error: !ok }),
  };
}
