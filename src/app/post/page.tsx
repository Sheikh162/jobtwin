import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/app-shell";
import { PostJobForm } from "@/components/post-job-form";

export default async function PostJobPage() {
  const session = await auth();
  if (!session?.user) redirect("/welcome");

  const companies = await prisma.company.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <AppShell>
      <div className="mb-4">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Post a job</h1>
        <p className="text-sm text-muted-foreground">
          Manual posting with tiered provenance — every listing shows where the info came from.
        </p>
      </div>
      <PostJobForm companies={companies} />
    </AppShell>
  );
}