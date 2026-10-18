import {
  BadgeIndianRupee,
  CalendarClock,
  HeartHandshake,
  MessageCircle,
  Radar,
  Truck,
  type LucideIcon,
} from "lucide-react";

type Benefit = { icon: LucideIcon; title: string; body: string };

const BENEFITS: Benefit[] = [
  {
    icon: Truck,
    title: "Doorstep pickup and delivery",
    body: "We collect from your door and bring everything back - no trips.",
  },
  {
    icon: CalendarClock,
    title: "Hourly pickup slots",
    body: "Choose a slot between 10 AM - 2 PM, or 3 PM - 8 PM.",
  },
  {
    icon: Radar,
    title: "Live order tracking",
    body: "Follow your order from pickup through cleaning to delivery.",
  },
  {
    icon: BadgeIndianRupee,
    title: "Transparent pricing",
    body: "Clear per-unit prices up front, confirmed after assessment.",
  },
  {
    icon: HeartHandshake,
    title: "Careful fabric handling",
    body: "Sorting and treatment matched to each fabric and garment.",
  },
  {
    icon: MessageCircle,
    title: "Easy WhatsApp support",
    body: "Questions? Message us on WhatsApp and we will sort it out.",
  },
];

export function WhyUClean() {
  return (
    <section id="why" className="scroll-mt-20">
      <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 md:py-16 lg:py-24">
        <div className="reveal-up max-w-2xl space-y-3">
          <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
            Why UClean
          </h2>
          <p className="text-muted-foreground">
            Thoughtful service, honest pricing and a clean you can count on.
          </p>
        </div>

        <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {BENEFITS.map((benefit) => {
            const Icon = benefit.icon;
            return (
              <li
                key={benefit.title}
                className="reveal-up border-border bg-card flex gap-4 rounded-2xl border p-5 shadow-sm"
              >
                <span
                  aria-hidden="true"
                  className="bg-primary text-primary-foreground grid size-11 shrink-0 place-items-center rounded-xl"
                >
                  <Icon className="size-5" />
                </span>
                <div>
                  <h3 className="font-semibold">{benefit.title}</h3>
                  <p className="text-muted-foreground mt-1 text-sm">
                    {benefit.body}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
