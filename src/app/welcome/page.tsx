import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";
import { Button } from "@/components/ui/button";
import { GithubIcon } from "@/components/github-icon";
import { ArrowRight } from "lucide-react";

export default async function WelcomePage() {
  const session = await auth();
  if (session?.user) redirect("/");

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm space-y-10 text-center">
        <div className="space-y-3">
          <h1 className="font-display text-4xl font-semibold tracking-tighter sm:text-5xl">
            Job search,
            <br />
            <span className="italic">with a twin.</span>
          </h1>
          <p className="mx-auto max-w-xs text-muted-foreground">
            Your digital twin watches career pages, fills application forms, and drafts
            outreach. You keep the decisions: swipe right on the roles worth pursuing.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <form
            action={async () => {
              "use server";
              await signIn("github", { redirectTo: "/" });
            }}
          >
            <Button type="submit" className="w-full gap-2 py-6 text-base">
              <GithubIcon className="h-5 w-5" />
              Continue with GitHub
            </Button>
          </form>
          <p className="text-xs text-muted-foreground">
            Signing in connects your GitHub profile and starts your agent.
          </p>
        </div>

        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <ArrowRight className="h-3.5 w-3.5" />
          The sourcing loop runs every 15 minutes.
        </div>
      </div>
    </div>
  );
}