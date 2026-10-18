import {
  ClipboardList,
  PackageCheck,
  Truck,
  WashingMachine,
  type LucideIcon,
} from "lucide-react";

type Step = { icon: LucideIcon; title: string; body: string };

const STEPS: Step[] = [
  {
    icon: ClipboardList,
    title: "Book",
    body: "Pick a service and a pickup slot online.",
  },
  {
    icon: Truck,
    title: "Pickup",
    body: "Our agent collects your items from your door.",
  },
  {
    icon: WashingMachine,
    title: "We clean",
    body: "Everything is washed and finished with care.",
  },
  {
    icon: PackageCheck,
    title: "Delivered",
    body: "Fresh laundry returned in your chosen slot.",
  },
];

export function HowItWorks() {
  return (
    <section
      id="how-it-works"
      className="border-border relative scroll-mt-20 overflow-hidden border-t bg-gradient-to-br from-[var(--secondary)]/60 via-[var(--background)] to-[var(--accent)]/70"
    >
      {/*
        Brand green glow, matching the Hero and About sections so the three
        read as one themed run.
      */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 -left-24 size-[26rem] rounded-full bg-[radial-gradient(circle,color-mix(in_oklab,var(--primary),transparent_78%),transparent)] blur-3xl"
      />

      <div className="relative mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 md:py-16 lg:py-24">
        <div className="reveal-up max-w-2xl space-y-3">
          <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
            How it works
          </h2>
          <p className="text-muted-foreground">
            Four steps from booking to fresh laundry back at your door.
          </p>
        </div>

        {/*
          Connected stepper. Each step renders its own connector segment rather
          than one shared line, so the line starts and ends exactly at the node
          centres and the chips' background-coloured rings cleanly mask the
          joins. The segment is horizontal from `lg` (chips on top, text below)
          and vertical below that (chips left, text right); the last step has no
          segment so the run ends at the final node.
        */}
        <ol className="mt-12 grid gap-10 lg:mt-16 lg:grid-cols-4 lg:gap-8">
          {STEPS.map((step, stepIndex) => {
            const Icon = step.icon;
            const isLast = stepIndex === STEPS.length - 1;
            return (
              <li
                key={step.title}
                className="reveal-up reveal-step relative flex gap-4 lg:flex-col lg:items-center lg:gap-0 lg:text-center"
              >
                {!isLast ? (
                  <span
                    aria-hidden="true"
                    className="bg-border absolute top-6 left-[calc(50%+2rem)] hidden h-px w-[calc(100%-2rem)] lg:block"
                  />
                ) : null}
                {!isLast ? (
                  <span
                    aria-hidden="true"
                    className="bg-border absolute top-14 -bottom-10 left-6 w-px lg:hidden"
                  />
                ) : null}

                <span className="bg-primary text-primary-foreground relative grid size-12 shrink-0 place-items-center rounded-2xl shadow-sm ring-4 ring-[var(--background)]">
                  <Icon aria-hidden="true" className="size-5" />
                  <span
                    aria-hidden="true"
                    className="font-display absolute -top-1.5 -right-1.5 grid size-6 place-items-center rounded-full bg-[var(--accent)] text-[0.6875rem] font-bold text-[var(--accent-foreground)] shadow-sm"
                  >
                    {stepIndex + 1}
                  </span>
                </span>

                <div className="min-w-0 lg:mt-5">
                  <h3 className="font-semibold">{step.title}</h3>
                  <p className="text-muted-foreground mt-1 text-sm">
                    {step.body}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
