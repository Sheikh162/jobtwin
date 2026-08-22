import Link from "next/link";
import {
  Layers,
  User,
  Home,
  Files,
  Handshake,
  Bot,
  MessageSquare,
  PenSquare,
  Sparkles,
} from "lucide-react";
import { auth } from "@/auth";

const tabs = [
  { href: "/", label: "Queue", icon: Layers },
  { href: "/applications", label: "Apps", icon: Files },
  { href: "/agent", label: "Agent", icon: Bot },
  { href: "/referrals", label: "Referrals", icon: Handshake },
  { href: "/profile", label: "Profile", icon: User },
];

const navItems = [
  { href: "/", label: "Queue", icon: Layers },
  { href: "/agent", label: "Agent", icon: Bot },
  { href: "/applications", label: "Applications", icon: Files },
  { href: "/referrals", label: "Referrals", icon: Handshake },
  { href: "/community", label: "Community", icon: MessageSquare },
  { href: "/post", label: "Post a Job", icon: PenSquare },
  { href: "/criteria", label: "Criteria", icon: Sparkles },
  { href: "/profile", label: "Profile", icon: User },
];

async function getUserInitials() {
  const session = await auth();
  if (!session?.user?.name) return "JT";
  return session.user.name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export async function AppShell({ children }: { children: React.ReactNode }) {
  const initials = await getUserInitials();

  return (
    <div className="flex min-h-dvh w-full flex-col lg:flex-row">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r bg-background/80 lg:flex">
        <Link href="/" className="flex items-center gap-2 px-5 py-5">
          <Home className="h-4 w-4" />
          <span className="font-display text-lg font-semibold tracking-tight">Jobtwin</span>
        </Link>
        <nav className="flex flex-1 flex-col gap-1 px-3">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="border-t px-5 py-4">
          <Link href="/profile" className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-[0.65rem] font-semibold text-primary-foreground">
              {initials}
            </span>
            <span className="text-sm text-muted-foreground">Profile</span>
          </Link>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top header */}
        <header className="sticky top-0 z-20 flex items-center justify-between border-b bg-background/80 px-4 py-3 backdrop-blur lg:hidden">
          <Link href="/" className="flex items-center gap-2">
            <Home className="h-4 w-4" />
            <span className="font-display text-lg font-semibold tracking-tight">Jobtwin</span>
          </Link>
          <Link
            href="/profile"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-[0.65rem] font-semibold text-primary-foreground"
          >
            {initials}
          </Link>
        </header>

        <main className="flex flex-1 flex-col px-4 pb-24 pt-4 lg:px-8 lg:pb-10 lg:pt-6">
          {children}
        </main>

        {/* Mobile bottom bar */}
        <nav className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/80 backdrop-blur lg:hidden">
          <div className="mx-auto flex max-w-lg">
            {tabs.map((tab) => (
              <Link
                key={tab.href}
                href={tab.href}
                className="flex flex-1 flex-col items-center gap-1 py-2.5 text-[0.65rem] text-muted-foreground transition-colors hover:text-foreground"
              >
                <tab.icon className="h-5 w-5" />
                {tab.label}
              </Link>
            ))}
          </div>
        </nav>
      </div>
    </div>
  );
}