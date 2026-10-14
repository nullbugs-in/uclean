import { permanentRedirect } from "next/navigation";

/**
 * Superseded by /pricing, which carries the full price list.
 *
 * Kept as a redirect rather than deleted so any existing bookmark or shared
 * link still lands somewhere useful.
 */
export default function ServicesPage() {
  permanentRedirect("/pricing");
}