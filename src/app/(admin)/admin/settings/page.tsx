import type { Metadata } from "next";

import { PagePlaceholder } from "@/components/placeholder";
import { StoreSettingsPanel } from "./store-settings-panel";

export const metadata: Metadata = { title: "Settings" };

/**
 * Store settings (section 8.13).
 *
 * The store's exact coordinates are what the server-side 6 km delivery check
 * measures from, so the pickup flow refuses to run until they are set here.
 * Saving is admin-only and appends an audit_logs row.
 *
 * Hero slides and the pickup-zone editor the section also names are not part of
 * this page yet.
 */
export default function AdminSettingsPage() {
  return (
    <PagePlaceholder
      title="Settings"
      description="Store location, delivery radius, address and contact details."
    >
      <StoreSettingsPanel />
    </PagePlaceholder>
  );
}
