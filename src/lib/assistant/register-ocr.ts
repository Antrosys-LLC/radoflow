import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import * as z from "zod/v4";

import { requireAnthropicEnv } from "@/lib/env";

/**
 * Reads one photographed register page and returns what it saw.
 *
 * Deliberately a single vision call, not a tool-use loop: the whole page is
 * already in front of the model, there is nothing else for it to go look up.
 * The output is never written anywhere by itself — every row this returns is
 * shown to a person to match against a real employee and correct before
 * anything reaches attendance_days. Handwriting is read wrong often enough
 * that this must stay a proposal, not an import.
 */

const ROW_SCHEMA = z.object({
  rows: z.array(
    z.object({
      nameAsWritten: z
        .string()
        .describe("The name or employee code exactly as written on that row, unedited."),
      date: z
        .string()
        .nullable()
        .describe(
          "YYYY-MM-DD if a date is legible for this row, otherwise null — never guess one.",
        ),
      status: z
        .enum(["present", "absent", "leave", "unclear"])
        .describe(
          "Best reading of the row's mark (tick, P/A/L, a filled box, etc.). Use 'unclear' rather than guessing when the mark is ambiguous or missing.",
        ),
      hoursWorked: z
        .number()
        .nullable()
        .describe("Hours worked if the register records a time in/out or a duration, else null."),
      note: z
        .string()
        .nullable()
        .describe(
          "Any other remark written on that row, verbatim — an advance amount, a reason, anything.",
        ),
    }),
  ),
  pageNote: z
    .string()
    .nullable()
    .describe(
      "Anything about the page as a whole worth a person knowing before they trust these rows — illegible sections, an unclear column header, ink that has faded, handwriting you were not confident about.",
    ),
});

export type ExtractedRegisterRow = z.infer<typeof ROW_SCHEMA>["rows"][number];

export interface ExtractedRegisterPage {
  rows: ExtractedRegisterRow[];
  pageNote: string | null;
}

const SYSTEM_PROMPT = `You are reading a photograph of a page from a paper attendance register at a Pakistani textile factory — a handwritten or typed muster roll, not a modern form. Extract every row you can make out, exactly as written; do not normalize, translate, or "correct" a name or mark. Where a mark is genuinely ambiguous, say so with status "unclear" rather than picking the more likely reading — a wrong guess here would misrecord someone's attendance, and a person will check every row before anything is saved. Do not invent rows for names you cannot read at all, and do not skip a row just because part of it is illegible — extract what you can and leave the rest null.`;

const SUPPORTED_MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
type SupportedMediaType = (typeof SUPPORTED_MEDIA_TYPES)[number];

export function isSupportedRegisterImage(mediaType: string): mediaType is SupportedMediaType {
  return (SUPPORTED_MEDIA_TYPES as readonly string[]).includes(mediaType);
}

export async function extractRegisterPage(
  base64: string,
  mediaType: SupportedMediaType,
): Promise<ExtractedRegisterPage> {
  const apiKey = requireAnthropicEnv();
  const client = new Anthropic({ apiKey });

  const message = await client.beta.messages.parse({
    model: "claude-sonnet-5",
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
          {
            type: "text",
            text: "Extract every row on this register page.",
          },
        ],
      },
    ],
    output_config: { format: betaZodOutputFormat(ROW_SCHEMA) },
  });

  const parsed = message.parsed_output;
  if (!parsed) {
    throw new Error("Could not read this page — try a clearer or better-lit photo.");
  }

  return parsed;
}
