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
  updated_at: string;
};

export type TimeSlot = {
  id: string;
  start_time: string;
  end_time: string;
  label: string | null;
  capacity: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type BlockedDate = {
  date: string;
  reason: string | null;
  created_at: string;
};

export type Order = {
  id: string;
  order_no: string;
  customer_id: string;
  created_by: string | null;
  source: OrderSource;
  customer_name: string;
  customer_mobile: string;
  address_snapshot: string;
  lat: number;
  lng: number;
  distance_km: number;
  pickup_slot_date: string;
  pickup_slot_id: string;
  delivery_slot_date: string | null;
  delivery_slot_id: string | null;
  status: OrderStatus;
  payment_mode: PaymentMode;
  accepted_zone_notice_at: string | null;
  notes: string | null;
  cancellation_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type OrderItem = {
  id: string;
  order_id: string;
  service_id: string | null;
  item_name: string;
  qty: number;
  unit_price: number;
  notes: string | null;
  photo_url: string | null;
  created_at: string;
};

export type OrderStatusHistory = {
  id: number;
  order_id: string;
  from_status: OrderStatus | null;
  to_status: OrderStatus;
  changed_by: string | null;
  note: string | null;
  created_at: string;
};

export type Agent = {
  id: string;
  zone: string | null;
  is_available: boolean;
  current_load: number;
  vehicle: string | null;
  created_at: string;
  updated_at: string;
};

export type PickupAssignment = {
  id: string;
  order_id: string;
  agent_id: string;
  type: AssignmentType;
  status: AssignmentStatus;
  assigned_by_type: "auto" | "manual";
  assigned_by: string | null;
  assigned_at: string;
  completed_at: string | null;
};

export type SlotBooking = {
  id: string;
  slot_date: string;
  slot_id: string;
  order_id: string;
  created_at: string;
};

export type Invoice = {
  id: string;
  order_id: string;
  invoice_no: string;
  customer_name: string;
  customer_mobile: string;
  billing_address: string;
  subtotal: number;
  tax: number;
  discount: number;
  delivery_charge: number;
  total: number;
  status: InvoiceStatus;
  pay_token: string | null;
  pay_token_expires_at: string | null;
  sent_at: string | null;
  paid_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type Payment = {
  id: string;
  invoice_id: string;
  mode: PaymentMode;
  gateway_payment_id: string | null;
  gateway_order_id: string | null;
  gateway_signature_valid: boolean | null;
  amount: number;
  status: PaymentStatus;
  collected_by: string | null;
  collected_at: string | null;
  failure_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type Notification = {
  id: number;
  user_id: string | null;
  destination: string | null;
  channel: NotificationChannel;
  template: NotificationTemplate;
  payload: Json;
  status: NotificationStatus;
  provider_message_id: string | null;
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  next_attempt_at: string;
  sent_at: string | null;
  invoice_id: string | null;
  order_id: string | null;
  created_at: string;
  updated_at: string;
};

export type OtpLog = {
  id: number;
  mobile: string;
  user_id: string | null;
  purpose: OtpPurpose;
  sent_at: string;
  verified_at: string | null;
  failed_attempts: number;
  request_ip: string | null;
};

export type AuditLog = {
  id: number;
  actor_id: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  before: Json | null;
  after: Json | null;
  created_at: string;
};

type Table<Row, Insert = Row, Update = Partial<Row>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

export type Database = {
  public: {
    Tables: {
      profiles: Table<
        Profile,
        Optional<
          Profile,
          | "id"
          | "role"
          | "is_active"
          | "can_view_all_orders"
          | "created_at"
          | "updated_at"
        >
      >;
      addresses: Table<
        Address,
        Optional<
          Address,
          "id" | "distance_km" | "is_default" | "created_at" | "updated_at"
        >
      >;
      services: Table<
        Service,
        Optional<
          Service,
          | "id"
          | "unit"
          | "is_active"
          | "sort_order"
          | "created_at"
          | "updated_at"
        >
      >;
      hero_slides: Table<
        HeroSlide,
        Optional<
          HeroSlide,
          | "id"
          | "subtitle"
          | "link"
          | "sort_order"
          | "is_active"
          | "created_at"
          | "updated_at"
        >
      >;
      store_settings: Table<
        StoreSettings,
        Optional<
          StoreSettings,
          | "id"
          | "lat"
          | "lng"
          | "address"
          | "phone"
          | "whatsapp_number"
          | "max_radius_km"
          | "opening_time"
          | "closing_time"
          | "break_start"
          | "break_end"
          | "gstin"
          | "updated_at"
        >
      >;
      time_slots: Table<
        TimeSlot,
        Optional<
          TimeSlot,
          "id" | "label" | "is_active" | "created_at" | "updated_at"
        >
      >;
      blocked_dates: Table<
        BlockedDate,
        Optional<BlockedDate, "date" | "reason" | "created_at">
      >;
      orders: Table<
        Order,
        Optional<
          Order,
          | "id"
          | "order_no"
          | "created_by"
          | "source"
          | "delivery_slot_date"
          | "delivery_slot_id"
          | "status"
          | "payment_mode"
          | "notes"
          | "cancellation_reason"
          | "created_at"
          | "updated_at"
        >
      >;
      order_items: Table<
        OrderItem,
        Optional<OrderItem, "id" | "qty" | "notes" | "photo_url" | "created_at">
      >;
      order_status_history: Table<
        OrderStatusHistory,
        Optional<
          OrderStatusHistory,
          "id" | "from_status" | "changed_by" | "note" | "created_at"
        >
      >;
      agents: Table<
        Agent,
        Optional<
          Agent,
          | "id"
          | "zone"
          | "is_available"
          | "current_load"
          | "vehicle"
          | "created_at"
          | "updated_at"
        >
      >;
      pickup_assignments: Table<
        PickupAssignment,
        Optional<
          PickupAssignment,
          | "id"
          | "status"
          | "assigned_by_type"
          | "assigned_by"
          | "assigned_at"
          | "completed_at"
        >
      >;
      slot_bookings: Table<
        SlotBooking,
        Optional<SlotBooking, "id" | "created_at">
      >;
      invoices: Table<
        Invoice,
        Optional<
          Invoice,
          | "id"
          | "invoice_no"
          | "customer_name"
          | "customer_mobile"
          | "billing_address"
          | "subtotal"
          | "tax"
          | "discount"
          | "delivery_charge"
          | "total"
          | "status"
          | "pay_token"
          | "pay_token_expires_at"
          | "sent_at"
          | "paid_at"
          | "created_by"
          | "created_at"
          | "updated_at"
        >
      >;
      payments: Table<
        Payment,
        Optional<
          Payment,
          | "id"
          | "gateway_payment_id"
          | "gateway_order_id"
          | "gateway_signature_valid"
          | "status"
          | "collected_by"
          | "collected_at"
          | "failure_reason"
          | "created_at"
          | "updated_at"
        >
      >;
      notifications: Table<
        Notification,
        Optional<
          Notification,
          | "id"
          | "user_id"
          | "destination"
          | "payload"
          | "status"
          | "provider_message_id"
          | "attempts"
          | "max_attempts"
          | "last_error"
          | "next_attempt_at"
          | "sent_at"
          | "invoice_id"
          | "order_id"
          | "created_at"
          | "updated_at"
        >
      >;
      otp_logs: Table<
        OtpLog,
        Optional<
          OtpLog,
          | "id"
          | "user_id"
          | "purpose"
          | "sent_at"
          | "verified_at"
          | "failed_attempts"
          | "request_ip"
        >
      >;
      audit_logs: Table<
        AuditLog,
        Optional<
          AuditLog,
          "id" | "actor_id" | "entity_id" | "before" | "after" | "created_at"
        >
      >;
    };
    Views: Record<string, never>;
    Functions: {
      book_pickup: {
        Args: {
          p_customer_id: string;
          p_customer_name: string;
          p_customer_mobile: string;
          p_address: string;
          p_lat: number;
          p_lng: number;
          p_distance_km: number;
          p_pickup_slot_date: string;
          p_pickup_slot_id: string;
          p_accepted_zone_notice_at: string;
          p_whatsapp_number?: string | null;
          p_notes?: string | null;
          p_source?: OrderSource;
          p_created_by?: string | null;
        };
        Returns: string;
      };
      auto_assign_agent: {
        Args: {
          p_order_id: string;
          p_slot_date: string;
          p_slot_id: string;
          p_zone?: string | null;
        };
        Returns: string | null;
      };
      allowed_order_transition: {
        Args: { p_from: OrderStatus; p_to: OrderStatus };
        Returns: boolean;
      };
      is_admin: { Args: Record<string, never>; Returns: boolean };
      is_staff: { Args: Record<string, never>; Returns: boolean };
      is_store_staff: { Args: Record<string, never>; Returns: boolean };
      is_assigned_to_order: { Args: { p_order_id: string }; Returns: boolean };
      refresh_agent_load: { Args: { p_agent_id: string }; Returns: undefined };
    };
    Enums: {
      app_role: AppRole;
      order_status: OrderStatus;
      order_source: OrderSource;
      payment_mode: PaymentMode;
      invoice_status: InvoiceStatus;
      payment_status: PaymentStatus;
      assignment_type: AssignmentType;
      assignment_status: AssignmentStatus;
      notification_channel: NotificationChannel;
      notification_status: NotificationStatus;
      notification_template: NotificationTemplate;
      otp_purpose: OtpPurpose;
    };
  };
};

export type TableRow<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];

export type TableInsert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];

export type TableUpdate<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];

/**
 * The single Supabase client type used everywhere.
 *
 * supabase-js's `SupabaseClient` has grown extra generic parameters across
 * versions, and the three constructors in this app (browser, server,
 * service-role) instantiate different subsets of them. Declaring one alias and
 * casting at the three construction sites keeps every query module on a single
 * type instead of threading version-specific generics through the codebase.
 */
export type DbClient = SupabaseClient<Database>;
