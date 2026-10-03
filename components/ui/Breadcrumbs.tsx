import Link from "next/link";
import { ChevronRight, Home } from "lucide-react";

export type BreadcrumbItem = {
  label: string;
  href?: string;
};

export default function Breadcrumbs({
  items,
}: {
  items: readonly BreadcrumbItem[];
}) {
  if (items.length === 0) {
    return null;
  }

  return (
    <nav aria-label="Breadcrumb" className="mb-4 min-w-0">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-stone-500">
        {items.map((item, index) => {
          const isCurrentPage = index === items.length - 1;
          const content = (
            <>
              {item.label === "Home" ? (
                <Home size={14} aria-hidden="true" />
              ) : null}
              <span className="wrap-break-word">{item.label}</span>
            </>
          );

          return (
            <li
              key={`${item.href ?? item.label}-${index}`}
              className="inline-flex min-w-0 items-center gap-2"
            >
              {index > 0 ? (
                <ChevronRight
                  size={14}
                  aria-hidden="true"
                  className="shrink-0 text-stone-400"
                />
              ) : null}
              {item.href && !isCurrentPage ? (
                <Link
                  href={item.href}
                  className="breadcrumb-link inline-flex min-w-0 items-center gap-1.5 transition-colors"
                >
                  {content}
                </Link>
              ) : (
                <span
                  aria-current={isCurrentPage ? "page" : undefined}
                  className="inline-flex min-w-0 items-center gap-1.5 text-stone-800"
                >
                  {content}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
