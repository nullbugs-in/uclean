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
  statusChangeSchema,
} from "./billing";
export type {
  CodInput,
  StatusChangeInput,
} from "./billing";

export {
  blockedDateSchema,
  bookingRulesSchema,
  slotSettingsSchema,
} from "./slot";
export type {
  BlockedDateInput,
  BlockedDateValues,
  BookingRulesInput,
  BookingRulesValues,
  SlotSettingsInput,
  SlotSettingsValues,
} from "./slot";

export { serviceSchema } from "./service";
export type { ServiceInput, ServiceValues } from "./service";

export { storeSettingsSchema } from "./store";
export type { StoreSettingsInput, StoreSettingsValues } from "./store";

export {
  walkInCustomerSchema,
  walkInLookupSchema,
  walkInRequestSchema,
} from "./walk-in";
export type {
  WalkInCustomerInput,
  WalkInLookupInput,
  WalkInRequestInput,
} from "./walk-in";
