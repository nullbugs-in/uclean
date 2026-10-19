"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import type { Profile } from "@/db/types";
import { cn } from "@/lib/utils";

import { panelIcon } from "./icons";
import type { PanelNavSection } from "./sidebar";

/**
 * Jump-to-page palette, opened with the platform's usual shortcut.
 *
 * The only commands it exposes today are the panel's own nav rows, which is
 * deliberately the whole feature: for someone who works the same dozen pages
 * all day, reaching them from the keyboard is the difference between a tool and
 * a website. Everything it lists is already reachable, so it cannot lead
 * anywhere new.
 */
export function PanelCommandMenu({
  sections,
  role,
  panelName,
  className,
}: {
  sections: PanelNavSection[];
  role: Profile["role"];
  panelName: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      /*
       * A guard, not paranoia: this listener is on `window`, so it sees every
       * event of type "keydown" on the page, including ones dispatched
       * synthetically by browser extensions and devtools. Those carry no `key`
       * at all, and `event.key.toLowerCase()` throws on them - taking the whole
       * panel down on someone else's extension.
       *
       * A real keypress always has a string `key`, so anything else is not a
       * keypress and dropping it cannot swallow a genuine Ctrl+K.
       */
      if (typeof event.key !== "string") return;

      // metaKey covers macOS; ctrlKey covers Windows and Linux.
      if (event.key.toLowerCase() !== "k") return;
      if (!event.metaKey && !event.ctrlKey) return;

      // Stop the browser's own Ctrl+K (focus address bar / search).
      event.preventDefault();
      setOpen((current) => !current);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const go = useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router],
  );

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        aria-label={`Search ${panelName.toLowerCase()}`}
        className={cn(
          "text-muted-foreground h-8 w-8 justify-center gap-2 px-0 font-normal sm:w-56 sm:justify-start sm:px-2",
          className,
        )}
        onClick={() => setOpen(true)}
      >
        <Search className="size-3.5 shrink-0" />
        <span className="hidden truncate sm:inline">
          Search {panelName.toLowerCase()}
        </span>
        <kbd className="bg-muted text-muted-foreground ml-auto hidden rounded border px-1.5 font-sans text-[10px] leading-5 font-medium sm:inline-block">
          Ctrl K
        </kbd>
      </Button>

      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Jump to"
        description="Search for a page in this panel."
      >
        <CommandInput placeholder="Where do you want to go?" />
        <CommandList>
          <CommandEmpty>No matching page.</CommandEmpty>
          {sections.map((section) => {
            const items = section.items.filter(
              (item) => !item.roles || item.roles.includes(role),
            );
            if (items.length === 0) return null;

            return (
              <CommandGroup key={section.title} heading={section.title}>
                {items.map((item) => {
                  const Icon = panelIcon(item.href);
                  return (
                    <CommandItem
                      key={item.href}
                      value={`${item.label} ${item.href}`}
                      onSelect={() => go(item.href)}
                    >
                      {Icon ? <Icon className="size-4" /> : null}
                      {item.label}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            );
          })}
        </CommandList>
      </CommandDialog>
    </>
  );
}
