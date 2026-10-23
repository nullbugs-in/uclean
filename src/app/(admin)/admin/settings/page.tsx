import type { Metadata } from "next";

import { PanelPage } from "@/components/panel/panel-page";
import { StoreSettingsPanel } from "./store-settings-panel";
import { WhatsAppSettingsPanel } from "./whatsapp-settings-panel";

export const metadata: Metadata = { title: "Settings" };

/**
 * Store settings (section 8.13).
 *
 * The store's exact coordinates are what the server-side 6 km delivery check
 * measures from, so the pickup flow refuses to run until they are set here.
 * Saving is admin-only and appends an audit_logs row.
 *
 * The WhatsApp card is the Cloud API integration: the on/off switch, the
 * Meta-approved template mapping, the connection status and a test message.
 * Its credentials live in the server environment, never in this panel.
 *
 * Hero slides and the pickup-zone editor the section also names are not part
 * of this page yet.
 */
export default function AdminSettingsPage() {
  return (
    <PanelPage
      title="Settings"
      description="Store location, delivery radius, address, contact details and the WhatsApp integration."
    >
      <StoreSettingsPanel />
      <WhatsAppSettingsPanel />
    </PanelPage>
  );
}
