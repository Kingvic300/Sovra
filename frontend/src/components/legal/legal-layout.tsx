import type { ReactNode } from "react";
import { MarketingFooter, MarketingHeader } from "@/components/marketing/marketing-layout";
import { LAST_UPDATED, type LegalSection } from "@/lib/legal";
import { useTitle } from "@/lib/use-title";

export function LegalLayout({
  title,
  summary,
  sections,
}: {
  title: string;
  summary: ReactNode;
  sections: LegalSection[];
}) {
  useTitle(title);

  return (
    <div className="flex min-h-dvh flex-col">
      <MarketingHeader />

      <div className="flex-1 px-4 py-8 sm:px-6 lg:grid lg:grid-cols-[240px_1fr] lg:gap-12 lg:px-10 lg:py-12 2xl:px-12">
        <aside className="hidden lg:block">
          <nav aria-label="On this page" className="sticky top-24">
            <p className="mb-2 text-[13px] font-semibold text-muted">On this page</p>
            <ol className="flex flex-col gap-0.5 border-l border-line">
              {sections.map((s) => (
                <li key={s.id}>
                  <a
                    href={`#${s.id}`}
                    className="-ml-px block border-l-2 border-transparent py-1.5 pl-4 text-[14px] text-muted transition-colors hover:border-cobalt hover:text-ink"
                  >
                    {s.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        </aside>

        <article className="min-w-0">
          <h1 className="text-[34px] leading-tight font-extrabold tracking-[-0.025em] sm:text-[40px]">{title}</h1>
          <p className="mt-2 text-muted">Last updated {LAST_UPDATED}</p>

          <div className="mt-8 rounded-card bg-card p-6 shadow-card">
            <h2 className="text-[15px] font-semibold">The short version</h2>
            <div className="mt-2 max-w-[72ch] text-[16px] leading-relaxed [&_li]:mt-1.5 [&_ul]:list-disc [&_ul]:pl-5">
              {summary}
            </div>
          </div>

          <div className="mt-10 flex flex-col gap-10">
            {sections.map((s) => (
              <section key={s.id} id={s.id} className="scroll-mt-24">
                <h2 className="text-[21px] font-bold tracking-[-0.015em]">{s.title}</h2>
                <div className="mt-3 flex max-w-[72ch] flex-col gap-3 text-[16px] leading-relaxed text-ink/90 [&_a]:font-semibold [&_a]:text-cobalt [&_a]:underline-offset-2 hover:[&_a]:underline [&_li]:mt-1.5 [&_strong]:font-semibold [&_strong]:text-ink [&_ul]:list-disc [&_ul]:pl-5">
                  {s.body}
                </div>
              </section>
            ))}
          </div>
        </article>
      </div>

      <MarketingFooter />
    </div>
  );
}
