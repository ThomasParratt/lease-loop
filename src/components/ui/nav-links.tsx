'use client';

// The main navigation links. A client component only because it marks the current page
// with aria-current, which needs the path.
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cx } from './cx';

export type NavItem = { href: string; label: string };

export function NavLinks({ items, label }: { items: NavItem[]; label: string }) {
  const pathname = usePathname();

  return (
    <nav aria-label={label}>
      <ul className="flex flex-wrap gap-1">
        {items.map((item) => {
          // The catalogue is /en; every other page is /en/<page> and owns its sub-pages.
          const isRoot = item.href.split('/').length === 2;
          const active = isRoot
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cx(
                  'block rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  active
                    ? 'bg-muted text-ink underline decoration-brand decoration-2 underline-offset-8'
                    : 'text-ink-muted hover:bg-muted hover:text-ink'
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
