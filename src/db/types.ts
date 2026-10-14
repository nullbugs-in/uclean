/**
 * Hand-maintained mirror of the schema in supabase/migrations.
 *
 * Regenerate with:
 *   npx supabase gen types typescript --local > src/db/types.ts
 *
 * The checked-in version exists so a fresh clone typechecks without Docker.
 * Regenerating after any migration is the source of truth, not editing here.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type AppRole = "customer" | "staff" | "admin";

export type OrderStatus =
  | "pickup_requested"
  | "agent_assigned"
  | "picked_up"
  | "under_analysis"
  | "invoice_sent"
  | "payment_pending"
  | "paid"
  | "in_process"
  | "ready_for_delivery"
  | "out_for_delivery"
  | "delivered"
  | "cancelled";

export type OrderSource = "online" | "walk_in";
export type PaymentMode = "cod" | "upi" | "card" | "netbanking" | "wallet";
export type InvoiceStatus = "draft" | "sent" | "paid" | "void";
export type PaymentStatus = "pending" | "collected" | "failed" | "refunded";
export type AssignmentType = "pickup" | "delivery";
export type AssignmentStatus =
  "assigned" | "in_progress" | "completed" | "cancelled";
export type NotificationChannel = "whatsapp" | "sms";
export type NotificationStatus =
  "queued" | "sending" | "sent" | "failed" | "read";
export type NotificationTemplate =
  | "otp"
  | "order_confirmed"
  | "agent_assigned"
  | "picked_up"
  | "invoice_ready"
  | "payment_received"
  | "out_for_delivery"
  | "delivered";
export type OtpPurpose = "login" | "pickup_number_verify";

export type Profile = {
  id: string;
  full_name: string;
  mobile: string;
  email: string | null;
  whatsapp_number: string | null;
  role: AppRole;
  is_active: boolean;
  can_view_all_orders: boolean;
  created_at: string;
  updated_at: string;
};

export type Address = {
  id: string;
  user_id: string;
  label: string;
  address_text: string;
  lat: number;
  lng: number;
  distance_km: number | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

export type Service = {
  id: string;
  name: string;
  description: string | null;
  unit: string;
  price: number;
  image_url: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type HeroSlide = {
  id: string;
  title: string;
  subtitle: string | null;
  image_url: string;
  link: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type StoreSettings = {
  id: boolean;
  lat: number | null;
  lng: number | null;
  address: string | null;
  phone: string | null;
  whatsapp_number: string | null;
  max_radius_km: number;
  opening_time: string;
  closing_time: string;
  break_start: string;
  break_end: string;
  gstin: string | null;
  cut_off_minutes: number;
  auto_assign: boolean;
  updated_at: string;
};
