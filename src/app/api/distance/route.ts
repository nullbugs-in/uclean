import { NextResponse } from "next/server";

import { z } from "zod";

import { DomainError } from "@/server/errors";
import { googleServerKeyOptional } from "@/server/env";
import { checkDeliveryZone } from "@/server/maps";

/**
 * Server-side delivery zone check for the booking wizard.
 *
 * The browser sends only coordinates, never a distance. The distance is
 * computed here with the server-side key (restricted to the Routes API and
 * never sent to a client), which is why the 6 km rule cannot be bypassed by
 * editing the request. book_pickup repeats the check inside the transaction.
 */

const bodySchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Send a valid latitude and longitude." },
      { status: 400 },
    );
  }

  try {
    const result = await checkDeliveryZone(
      parsed.data,
      googleServerKeyOptional(),
    );
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof DomainError) {
      return NextResponse.json(
        { error: error.userMessage },
        { status: error.status },
      );
    }

    // An upstream failure is not the customer's fault, so it is a 502 rather
    // than a message blaming their address.
    console.error("Delivery zone check failed", error);
    return NextResponse.json(
      {
        error: "We could not check your location right now. Please try again.",
      },
      { status: 502 },
    );
  }
}
