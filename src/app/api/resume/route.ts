import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { parseResume } from "@/lib/resume";
import { PDFParse } from "pdf-parse";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_SIZE = 5 * 1024 * 1024; // 5MB

async function extractTextFromBuffer(buf: Buffer, filename: string): Promise<string> {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".txt") || lower.endsWith(".md") || lower.endsWith(".json")) {
    return buf.toString("utf-8");
  }

  if (lower.endsWith(".pdf")) {
    try {
      const parser = new PDFParse({ data: new Uint8Array(buf) });
      const result = (await parser.getText()) as { text?: string };
      return result.text ?? "";
    } catch (err) {
      console.error("[resume] pdf-parse failed:", err);
      return "";
    }
  }

  return "";
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "File too large (max 5MB)" }, { status: 413 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const text = await extractTextFromBuffer(buf, file.name);
  if (text.trim().length < 40) {
    return NextResponse.json(
      { error: "Could not read text from this file. Try a plain-text or PDF resume." },
      { status: 422 }
    );
  }

  let parsed;
  try {
    parsed = await parseResume(text);
  } catch (err) {
    console.error("[resume] parse failed:", err);
    return NextResponse.json({ error: "Resume parsing failed. Try again." }, { status: 500 });
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      resumeParsed: JSON.parse(JSON.stringify(parsed)) as object,
      resumeFileName: file.name,
      githubUsername: parsed.githubUsername ?? undefined,
    },
  });

  return NextResponse.json({ ok: true, profile: parsed });
}