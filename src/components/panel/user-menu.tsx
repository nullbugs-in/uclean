"use client";

import { useTransition } from "react";
import Link from "next/link";
import { ChevronsUpDown, LogOut } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenuButton, useSidebar } from "@/components/ui/sidebar";
import type { Profile } from "@/db/types";
import { signOutAction } from "@/server/sign-out";

/** Panels a role can reach, used to build the switch list. */
const PANELS: Array<{
  href: string;
  label: string;
  roles: ReadonlyArray<Profile["role"]>;
}> = [
  { href: "/staff", label: "Staff panel", roles: ["staff", "admin"] },
  { href: "/admin", label: "Admin panel", roles: ["admin"] },
  {
    href: "/account",
    label: "My account",
    roles: ["customer", "staff", "admin"],
  },
];

function initials(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

/**
 * Account menu in the sidebar footer.
 *
 * Staff and admin accounts can hold more than one panel, so the switch list is
 * built from the role rather than hard-coded: a customer sees only their
 * account, an admin sees all three. Sign-out calls the same server action the
 * standalone button uses, rather than reimplementing session teardown.
 */
export function PanelUserMenu({
  user,
  panelName,
}: {
  user: { full_name: string; role: Profile["role"] };
  panelName: string;
}) {
  const [isPending, startTransition] = useTransition();
  const { isMobile } = useSidebar();

  const reachable = PANELS.filter((panel) => panel.roles.includes(user.role));

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton
          size="lg"
          tooltip={user.full_name}
          className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
        >
          <Avatar className="size-8 rounded-lg">
            <AvatarFallback className="bg-sidebar-primary text-sidebar-primary-foreground rounded-lg text-xs font-semibold">
              {initials(user.full_name)}
            </AvatarFallback>
          </Avatar>
          <div className="grid flex-1 text-left text-sm leading-tight">
            <span className="truncate font-medium">{user.full_name}</span>
            <span className="text-muted-foreground truncate text-xs capitalize">
              {user.role} - {panelName}
            </span>
          </div>
          <ChevronsUpDown className="ml-auto size-4" />
        </SidebarMenuButton>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
        side={isMobile ? "bottom" : "right"}
        align="end"
        sideOffset={4}
      >
        <DropdownMenuLabel className="p-0 font-normal">
          <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
            <Avatar className="size-8 rounded-lg">
              <AvatarFallback className="bg-sidebar-primary text-sidebar-primary-foreground rounded-lg text-xs font-semibold">
                {initials(user.full_name)}
              </AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">{user.full_name}</span>
              <span className="text-muted-foreground truncate text-xs capitalize">
                {user.role}
              </span>
            </div>
          </div>
        </DropdownMenuLabel>

        {reachable.length > 1 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-muted-foreground text-xs">
              Switch panel
            </DropdownMenuLabel>
            {reachable.map((panel) => (
              <DropdownMenuItem key={panel.href} asChild>
                <Link href={panel.href}>{panel.label}</Link>
              </DropdownMenuItem>
            ))}
          </>
        )}

        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={isPending}
          onSelect={(event) => {
            // Keep the menu mounted while the action runs so the pending label
            // is actually visible.
            event.preventDefault();
            startTransition(async () => {
              await signOutAction();
            });
          }}
        >
          <LogOut className="size-4" />
          {isPending ? "Signing out..." : "Sign out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
