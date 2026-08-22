import { redirect } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/app-shell";
import { PostComposer } from "@/components/post-composer";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function CommunityPage() {
  const session = await auth();
  if (!session?.user) redirect("/welcome");

  const [posts, companies] = await Promise.all([
    prisma.communityPost.findMany({
      include: { company: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.company.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <AppShell>
      <div className="mb-4">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Community</h1>
        <p className="text-sm text-muted-foreground">
          Interview and culture signal, verified-anonymous. Scoped by company and role.
        </p>
      </div>

      <div className="mb-4">
        <PostComposer companies={companies} />
      </div>

      <div className="space-y-3">
        {posts.length === 0 && (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No posts yet — be the first to verify what a company is really like.
            </CardContent>
          </Card>
        )}
        {posts.map((post) => (
          <Card key={post.id}>
            <CardContent className="space-y-2 pt-5">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="font-mono text-foreground/80">{post.pseudonym}</span>
                <span>·</span>
                <span>{formatDistanceToNow(new Date(post.createdAt), { addSuffix: true })}</span>
                {post.tier !== "UNVERIFIED" && (
                  <Badge variant="outline" className="rounded-md text-[0.65rem] font-normal normal-case">
                    {post.tier === "DOMAIN_VERIFIED" ? "Domain verified" : "Presence confirmed"}
                  </Badge>
                )}
              </div>
              {(post.company?.name || post.role) && (
                <p className="flex items-center gap-2 text-xs font-medium">
                  {post.company?.name && <span className="text-primary">{post.company.name}</span>}
                  {post.role && <span className="text-muted-foreground">{post.role}</span>}
                </p>
              )}
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{post.body}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </AppShell>
  );
}