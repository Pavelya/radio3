'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
  {
    label: 'Dashboard',
    href: '/dashboard',
    icon: '📊',
  },
  {
    label: 'Content & Knowledge',
    items: [
      { label: 'Content', href: '/dashboard/content', icon: '📚' },
      { label: 'Events', href: '/dashboard/events', icon: '📅' },
    ],
  },
  {
    label: 'Radio Configuration',
    items: [
      { label: 'DJs', href: '/dashboard/djs', icon: '🎙️' },
      { label: 'Programs', href: '/dashboard/programs', icon: '📻' },
      { label: 'Format Clocks', href: '/dashboard/format-clocks', icon: '🕐' },
      { label: 'Schedule', href: '/dashboard/broadcast-schedule', icon: '📋' },
      { label: 'Music Library', href: '/dashboard/music', icon: '🎵' },
    ],
  },
  {
    label: 'Production',
    items: [
      { label: 'Segments', href: '/dashboard/segments', icon: '🎵' },
    ],
  },
  {
    label: 'System',
    items: [
      { label: 'Monitoring', href: '/dashboard/monitoring', icon: '📈' },
      { label: 'Daily Schedule', href: '/dashboard/schedule', icon: '📅' },
      { label: 'Analytics', href: '/dashboard/analytics', icon: '📊' },
      { label: 'DLQ', href: '/dashboard/dlq', icon: '⚠️' },
    ],
  },
];

export default function SidebarNav() {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === '/dashboard') {
      return pathname === href;
    }
    return pathname.startsWith(href);
  };

  return (
    <div className="w-64 bg-gray-900 min-h-screen text-white">
      <div className="p-4">
        <h1 className="text-xl font-bold mb-8">AI Radio 2525</h1>

        <nav className="space-y-6">
          {navItems.map((section, idx) => (
            <div key={idx}>
              {section.items ? (
                // Section with subitems
                <div>
                  <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                    {section.label}
                  </div>
                  <div className="space-y-1">
                    {section.items.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={`flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                          isActive(item.href)
                            ? 'bg-gray-800 text-white'
                            : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                        }`}
                      >
                        <span className="mr-3">{item.icon}</span>
                        {item.label}
                      </Link>
                    ))}
                  </div>
                </div>
              ) : (
                // Single item (like Dashboard)
                <Link
                  href={section.href!}
                  className={`flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    isActive(section.href!)
                      ? 'bg-gray-800 text-white'
                      : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                  }`}
                >
                  <span className="mr-3">{section.icon}</span>
                  {section.label}
                </Link>
              )}
            </div>
          ))}
        </nav>
      </div>
    </div>
  );
}
