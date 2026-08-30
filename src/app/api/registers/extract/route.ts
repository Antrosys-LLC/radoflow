import { NextResponse, type NextRequest } from "next/server";

import { extractRegisterPage, isSupportedRegisterImage } from "@/lib/assistant/register-ocr";
import { getSession } from "@/lib/auth/session";
import { requireAnthropicEnv } from "@/lib/env";

/**
 * Reads one photographed register page and hands back proposed rows.
 *
 * Nothing here touches the database — see register-ocr.ts. The image never
 * leaves this request either: it is sent straight to Claude and discarded,
 * not stored.
 */

export const dynamic = "force-dynamic";

// Comfortably above what a phone photo needs at Claude's own vision limits,
// while still refusing a request large enough to be a mistake (a video, a
// multi-page PDF someone tried to sneak through as an "image").
const MAX_BASE64_LENGTH = 8_000_000;

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  if (!session.isSuperuser && !session.permissions.has("registers.import")) {
    return NextResponse.json({ error: "Not allowed to import registers." }, { status: 403 });
  }

  let body: { imageBase64?: unknown; mediaType?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const imageBase64 = typeof body.imageBase64 === "string" ? body.imageBase64 : "";
  const mediaType = typeof body.mediaType === "string" ? body.mediaType : "";

  if (!imageBase64) {
    return NextResponse.json({ error: "No image received." }, { status: 400 });
  }
  if (imageBase64.length > MAX_BASE64_LENGTH) {
    return NextResponse.json(
      { error: "That photo is too large — try a smaller file." },
      { status: 400 },
    );
  }
  if (!isSupportedRegisterImage(mediaType)) {
    return NextResponse.json(
      { error: "Unsupported image type — use a JPEG, PNG, WebP or GIF photo." },
      { status: 400 },
    );
  }

  try {
    requireAnthropicEnv();
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Assistant is not configured." },
      { status: 503 },
    );
  }

  try {
    const page = await extractRegisterPage(imageBase64, mediaType);
    return NextResponse.json(page);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not read that page." },
      { status: 502 },
    );
  }
}
