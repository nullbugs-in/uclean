export { mobileSchema, signUpSchema, verifyOtpSchema } from "./auth";
export type { SignUpInput, VerifyOtpInput } from "./auth";

export {
  bookPickupSchema,
  bookingDetailsSchema,
  pickupRequestSchema,
  slotBookingSchema,
  zoneNoticeSchema,
} from "./booking";
export type {
  BookPickupInput,
  BookingDetailsInput,
  PickupRequestInput,
  SlotBookingInput,
} from "./booking";

export {
  codSchema,
  invoiceSchema,
  orderItemSchema,
  statusChangeSchema,
} from "./billing";
export type {
  CodInput,
  InvoiceInput,
  OrderItemInput,
  StatusChangeInput,
} from "./billing";

export { blockedDateSchema, slotSettingsSchema } from "./slot";
export type {
  BlockedDateInput,
  BlockedDateValues,
  SlotSettingsInput,
  SlotSettingsValues,
} from "./slot";

export { storeSettingsSchema } from "./store";
export type { StoreSettingsInput, StoreSettingsValues } from "./store";
