import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Film, Gauge, ListVideo, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CourtBase — Turn Game Film Into Player Development" },
      {
        name: "description",
        content:
          "Upload game film, build player-specific clip libraries, evaluate decisions and track development. Basketball first, built for every sport.",
      },
      { property: "og:title", content: "CourtBase — Turn Game Film Into Player Development" },
      {
        property: "og:description",
        content:
          "A serious player-development film platform for athletes, parents, coaches and trainers.",
      },
    ],
  }),
  component: Landing,
});

const features = [
  {
    icon: Film,
    title: "Player-specific film",
    body: "Every clip is tied to a game, a player, a timestamp and an event type — not a shared team folder.",
  },
  {
    icon: ListVideo,
    title: "Film views, not feeds",
    body: "Drives, paint touches, makes, misses, defense. Jump straight to the film view you need.",
  },
  {
    icon: Gauge,
    title: "Decision-quality first",
    body: "Evaluate the read, not just the result, with decision, outcome and impact scoring.",
  },
  {
    icon: ShieldCheck,
    title: "Built for every sport",
    body: "Basketball is version one. The event taxonomy is data, so new sports drop in without a rebuild.",
  },
];

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-5">
        <div className="flex items-center gap-2">
          <span className="grid size-9 place-items-center rounded-md bg-primary font-display font-bold text-primary-foreground">
            CB
          </span>
          <span className="label-caps text-sm font-semibold">CourtBase</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/auth">Sign in</Link>
          </Button>
          <Button size="sm" asChild>
            <Link to="/auth" search={{ mode: "signup" }}>
              Create account
            </Link>
          </Button>
        </div>
      </header>

      <section className="field-grid border-y border-border">
        <div className="mx-auto w-full max-w-6xl px-4 py-20">
          <p className="label-caps text-xs text-primary">Player development platform</p>
          <h1 className="mt-4 max-w-3xl text-5xl font-semibold uppercase leading-[0.95] sm:text-7xl">
            Game film in.
            <br />
            Player development out.
          </h1>
          <p className="mt-6 max-w-xl text-base text-muted-foreground">
            CourtBase organizes game film around one athlete: identify the player, generate their
            clips, evaluate the decisions, and build a development library that actually gets used.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button size="lg" asChild>
              <Link to="/auth" search={{ mode: "signup" }}>
                Get started <ArrowRight className="ml-1 size-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link to="/auth">I already have an account</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 py-16">
        <h2 className="text-2xl font-semibold uppercase">What you get in phase one</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((feature) => (
            <div key={feature.title} className="rounded-xl border border-border bg-card p-5">
              <feature.icon className="size-5 text-primary" />
              <h3 className="mt-4 text-lg font-semibold uppercase">{feature.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{feature.body}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-6 text-xs text-muted-foreground">
          <p>CourtBase — basketball first, built for every sport.</p>
          <p>Video analysis features arrive in later phases.</p>
        </div>
      </footer>
    </div>
  );
}
