import type { Metadata } from "next";

import { PagePlaceholder } from "@/components/placeholder";
import { StoreSettingsPanel } from "./store-settings-panel";

export const metadata: Metadata = { title: "Settings" };

/**
 * Store settings, hero slides and pickup-zone configuration (section 8.13).
 *
 * The store's exact coordinates are still an open question in the source
 * design, so the seed leaves them NULL and the pickup flow refuses to run
 * until they are filled in here. Setting them is the one thing standing between
 * this scaffold and a working booking flow.
 */
export default function AdminSettingsPage() {
  return (
    <PagePlaceholder
      title="Settings"
      description="Store location, delivery radius, hours and hero slides."
      milestone="Milestone 4"
    >
      <StoreSettingsPanel />
    </PagePlaceholder>
  );
}
