/**
 * Public services and prices.
 *
 * NOTE: prices here are placeholders for the marketing page. In a later phase
 * they are read from the `services` table so an admin can edit them without a
 * deploy - this array will then be replaced by a database query, keeping the
 * same `Service` shape.
 */

import {
  Blinds,
  Flame,
  Footprints,
  Shirt,
  Sparkles,
  Zap,
  type LucideIcon,
} from "lucide-react";

export type Service = {
  id: string;
  name: string;
  description: string;
  icon: LucideIcon;
  /** Placeholder price label, e.g. "₹79". */
  priceText: string;
  /** Unit the price applies to, e.g. "kg". */
  unit: string;
};

export const services: Service[] = [
  {
    id: "express-service",
    name: "Express Service",
    description: "Priority handling with a 24-hour turnaround.",
    icon: Zap,
    priceText: "₹99",
    unit: "kg",
  },
  {
    id: "wash-and-fold",
    name: "Wash and Fold",
    description: "Everyday laundry washed, dried and neatly folded.",
    icon: Shirt,
    priceText: "₹69",
    unit: "kg",
  },
  {
    id: "dry-cleaning",
    name: "Dry Cleaning",
    description: "Gentle solvent cleaning for suits, silks and delicates.",
    icon: Sparkles,
    priceText: "₹149",
    unit: "piece",
  },
  {
    id: "ironing",
    name: "Ironing",
    description: "Crisp, pressed finish for clothes and linens.",
    icon: Flame,
    priceText: "₹15",
    unit: "piece",
  },
  {
    id: "shoe-cleaning",
    name: "Shoe Cleaning",
    description: "Deep clean, deodorise and polish for all footwear.",
    icon: Footprints,
    priceText: "₹199",
    unit: "pair",
  },
  {
    id: "curtain-cleaning",
    name: "Curtain Cleaning",
    description: "Dust-free, fresh curtains with careful handling.",
    icon: Blinds,
    priceText: "₹40",
    unit: "sq ft",
  },
];
