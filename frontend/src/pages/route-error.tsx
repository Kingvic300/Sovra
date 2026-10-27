import { Link, isRouteErrorResponse, useRouteError } from "react-router";
import { Wordmark } from "@/components/shell/logo";
import { buttonClass } from "@/components/ui/button-class";

export default function RouteErrorPage() {
  const error = useRouteError();
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  const detail = error instanceof Error ? error.message : isRouteErrorResponse(error) ? error.statusText : null;

  return (
    <div className="flex min-h-dvh flex-col px-6 py-6 sm:px-10">
      <Link to="/" className="text-[22px]" aria-label="Sovra home">
        <Wordmark />
      </Link>
      <div className="flex flex-1 flex-col items-start justify-center gap-3">
        <h1 className="text-[30px] font-extrabold tracking-[-0.025em]">
          {notFound ? "This page doesn't exist" : "Something broke on this page"}
        </h1>
        <p className="max-w-[56ch] text-muted">
          {notFound
            ? "The link may be old. Your money and memories are where you left them."
            : "Your data is safe. Reload the page, or go back to the overview."}
        </p>
        {import.meta.env.DEV && detail && (
          <pre className="max-w-full overflow-x-auto rounded-lg bg-card px-4 py-3 text-[13px] text-over shadow-card">{detail}</pre>
        )}
        <div className="mt-2 flex gap-2">
          <Link to="/app" className={buttonClass()}>
            Go to overview
          </Link>
          <button type="button" onClick={() => window.location.reload()} className={buttonClass("secondary")}>
            Reload
          </button>
        </div>
      </div>
    </div>
  );
}
