import Link from "next/link";
import { Layers, User, Home, Send, Files } from "lucide-react";
import { auth } from "@/auth";

const tabs = [
  { href: "/", label: "Queue", icon: Layers },
  { href: "/applications", label: "Apps", icon: Files },
  { href: "/community", label: "Community", icon: Send },
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
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b bg-background/80 px-4 py-3 backdrop-blur">
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

      <main className="flex flex-1 flex-col px-4 pb-24 pt-4">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/80 backdrop-blur">
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
  );
}