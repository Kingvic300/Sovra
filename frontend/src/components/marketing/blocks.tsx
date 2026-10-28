import type { ReactNode } from "react";
import { Link } from "react-router";
import { buttonClass } from "@/components/ui/button-class";
import { Remembered } from "@/components/ui/remembered";
import { useAuth } from "@/lib/auth-context";

/** Full-width page section with consistent side padding. */
export function Section({ children, className = "", id }: { children: ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={`px-5 py-16 sm:px-8 lg:px-14 lg:py-24 ${className}`}>
      {children}
    </section>
  );
}

export function PageIntro({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Section className="!pb-8 lg:!pb-12">
      <h1 className="max-w-[18ch] text-[44px] leading-[1.02] font-extrabold tracking-[-0.035em] sm:text-[60px]">{title}</h1>
      <div className="mt-5 max-w-[60ch] text-[18px] leading-relaxed text-muted">{children}</div>
    </Section>
  );
}

/** The memory card used across marketing pages. */
export function MemoryCard({ items, className = "" }: { items: { text: string; highlight: string }[]; className?: string }) {
  return (
    <div className={`rounded-card bg-card p-5 shadow-pop ${className}`}>
      <p className="flex items-center justify-between text-[13px] text-muted">
        Sovra remembers
        <span className="flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-gain" />
          Saved to Walrus
        </span>
      </p>
      <ul className="mt-3 flex flex-col gap-2 text-[15px]">
        {items.map((m) => (
          <li key={m.text}>
            <Remembered text={m.text} highlight={m.highlight} />
          </li>
        ))}
      </ul>
    </div>
  );
}

export function CtaBand() {
  const { status } = useAuth();
  return (
    <section className="bg-cobalt px-5 py-16 text-white sm:px-8 lg:px-14 lg:py-20">
      <div className="flex flex-wrap items-end justify-between gap-8">
        <div>
          <h2 className="max-w-[20ch] text-[36px] leading-[1.05] font-extrabold tracking-[-0.03em] sm:text-[46px]">
            Start with one goal. Sovra does the remembering.
          </h2>
          <p className="mt-3 max-w-[52ch] text-[17px] text-white/80">
            Sign in with Google in one tap. No seed phrase, no bank password, nothing to install.
          </p>
        </div>
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          {status === "signed-in" ? (
            <Link to="/app" className={`${buttonClass()} h-12 bg-white px-6 text-[15px] !text-cobalt hover:!bg-white/90`}>
              Open Sovra
            </Link>
          ) : (
            <>
              <Link to="/signup" className={`${buttonClass()} h-12 bg-white px-6 text-[15px] !text-cobalt hover:!bg-white/90`}>
                Get started free
              </Link>
              <Link to="/signin" className={`${buttonClass()} h-12 bg-white/10 px-6 text-[15px] hover:!bg-white/20`}>
                Try the demo
              </Link>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
