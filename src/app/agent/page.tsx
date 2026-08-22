import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/app-shell";
import { AgentChat } from "@/components/agent-chat";

export default async function AgentPage() {
  const session = await auth();
  if (!session?.user) redirect("/welcome");

  return (
    <AppShell>
      <div className="mb-4">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Agent</h1>
        <p className="text-sm text-muted-foreground">
          Your sourcing twin. Ask what it found, why it matched, or to check a company right now.
        </p>
      </div>
      <AgentChat userId={session.user.id} />
    </AppShell>
  );
}