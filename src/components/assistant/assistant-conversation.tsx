"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Mic, Send, Square, Volume2 } from "lucide-react";
import { toast } from "sonner";

import { Fill } from "@/components/fill";
import { useDictionary } from "@/components/language-provider";
import { Latin } from "@/components/latin";
import { cn } from "@/lib/utils";
import { DEFAULT_EFFORT, EFFORT_LEVELS, type EffortLevel } from "@/lib/assistant/models";
import type { AskContext } from "@/lib/assistant/context";
import { LANGUAGE_LABELS, type LanguageCode } from "@/lib/i18n";

/**
 * The "Ask" conversation — shared by the full /assistant page and the
 * floating widget in the app shell, so the voice handling, language
 * switching and preset wording exist once rather than twice.
 *
 * Built for people who are not confident readers of English, and who may not
 * be confident with a keyboard at all — a factory owner or floor manager who
 * would rather speak a question than navigate the rest of the app. Three ways
 * in, all landing on the same /api/assistant call: tap a preset, type, or
 * speak. Voice always passes through a confirmation step before it is sent,
 * because a misheard word here has no way to be proof-read afterwards.
 */

/**
 * The language the assistant *answers* in — chosen here, one question at a
 * time, and deliberately not the language the interface is written in.
 *
 * They share the three codes (`@/lib/i18n`) because they are the same three
 * languages, and nothing else: a person asking for one answer in Urdu keeps
 * the app in whatever they set on their profile, and changing their profile
 * language does not change the language they are being answered in. The
 * interface strings on this screen come from `useDictionary()`; everything
 * keyed by this type is an utterance in the conversation.
 */
type AnswerLanguage = LanguageCode;

const SPEECH_LANG: Record<AnswerLanguage, string> = {
  ur: "ur-PK",
  "roman-ur": "ur-PK",
  en: "en-US",
};

export interface Preset {
  ur: string;
  romanUr: string;
  en: string;
}

const PRESETS: Preset[] = [
  {
    ur: "آج کتنے لوگ غیر حاضر تھے؟",
    romanUr: "Aaj kitne log ghair hazir thay?",
    en: "How many people were absent today?",
  },
  {
    ur: "آج کون کون دیر سے آیا؟",
    romanUr: "Aaj kaun der se aaya?",
    en: "Who was late today?",
  },
  {
    ur: "اس مہینے اوور ٹائم کتنے گھنٹے ہوا؟",
    romanUr: "Is mahine overtime kitne ghante hua?",
    en: "How many overtime hours this month?",
  },
  {
    ur: "اس مہینے کی تنخواہ کتنی بنتی ہے؟",
    romanUr: "Is mahine ki tankhwah kitni banti hai?",
    en: "What is the payroll total this month?",
  },
];

function presetText(preset: Preset, language: AnswerLanguage): string {
  if (language === "ur") return preset.ur;
  if (language === "roman-ur") return preset.romanUr;
  return preset.en;
}

/**
 * The empty thread's opening line. An utterance rather than chrome — it invites
 * a question, in the language the question is expected in — so it is keyed by
 * the answer language beside the presets, not held in the dictionary.
 */
const GREETING: Record<AnswerLanguage, (name: string) => string> = {
  ur: (name) => `السلام علیکم ${name}، کیا پوچھنا چاہتے ہیں؟`,
  "roman-ur": (name) => `Assalam-o-Alaikum ${name}, kya poochna chahte hain?`,
  en: (name) => `Hi ${name}, what would you like to know?`,
};

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  /** Rupees this answer cost. Absent on the user's own messages. */
  costPkr?: number;
}

/** The subset of the Web Speech API this component uses — not in TS's DOM lib. */
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  onresult:
    ((event: { results: { [index: number]: { 0: { transcript: string } } } }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * Reads the saved answer language once, at mount — avoids a render just to
 * apply it. Stored in the browser rather than on the profile, because it is a
 * per-question choice and not a setting about the person.
 */
function initialAnswerLanguage(): AnswerLanguage {
  if (typeof window === "undefined") return "en";
  try {
    const saved = window.localStorage.getItem("radoflow-assistant-language");
    if (saved === "ur" || saved === "roman-ur" || saved === "en") return saved;
  } catch {
    // Private browsing or storage disabled — fall through to the default.
  }
  return "en";
}

export function AssistantConversation({
  firstName,
  compact = false,
  context,
  presets,
  greeting,
}: {
  firstName: string;
  /** The floating widget: tighter spacing, presets only while the thread is empty. */
  compact?: boolean;
  /**
   * The record the question is about, when it was asked from one.
   *
   * Sent with every question in the thread rather than only the first: a
   * follow-up — "and the month before?" — is still about the same person, and
   * a thread that forgets which one after one turn is worse than no context.
   */
  context?: AskContext;
  /** Questions worth offering here. Defaults to the four general ones. */
  presets?: Preset[];
  /** The opening line, when the general greeting would be too vague. */
  greeting?: string;
}) {
  const t = useDictionary();
  const [answerLanguage, setAnswerLanguage] = useState<AnswerLanguage>(initialAnswerLanguage);
  const [effort, setEffort] = useState<EffortLevel>(DEFAULT_EFFORT);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [pendingTranscript, setPendingTranscript] = useState<string | null>(null);
  // Checked once at mount via a lazy initializer rather than an effect: it's a
  // one-time feature check, not a subscription to anything that changes.
  const [speechSupported] = useState(
    () => typeof window !== "undefined" && getSpeechRecognitionCtor() !== null,
  );
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      window.localStorage.setItem("radoflow-assistant-language", answerLanguage);
    } catch {
      // Convenience only — nothing breaks if this can't be saved.
    }
  }, [answerLanguage]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  function speak(text: string) {
    if (!("speechSynthesis" in window)) return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = SPEECH_LANG[answerLanguage];
      window.speechSynthesis.speak(utterance);
    } catch {
      // Not every device has a matching voice installed — fail silently;
      // the text answer is still on screen either way.
    }
  }

  async function ask(question: string) {
    const trimmed = question.trim();
    if (!trimmed || loading) return;

    // Captured before the optimistic append, so the thread sent as context is
    // the conversation *before* this question rather than including it twice.
    const history = messages.slice(-8);

    setMessages((prev) => [...prev, { role: "user", text: trimmed }]);
    setInput("");
    setLoading(true);

    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          question: trimmed,
          language: answerLanguage,
          history,
          effort,
          ...(context ? { context } : {}),
        }),
      });
      const body = (await response.json().catch(() => null)) as {
        answer?: string;
        costPkr?: number;
        error?: string;
      } | null;

      if (!response.ok || !body?.answer) {
        toast.error(body?.error ?? t.ask.noAnswer);
        setMessages((prev) => prev.slice(0, -1));
        return;
      }

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: body.answer!,
          // Spread rather than assign: exactOptionalPropertyTypes treats an
          // explicit undefined as different from an absent key.
          ...(typeof body.costPkr === "number" ? { costPkr: body.costPkr } : {}),
        },
      ]);
      speak(body.answer);
    } catch {
      toast.error(t.ask.unreachable);
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setLoading(false);
    }
  }

  function startListening() {
    if (listening) return;
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return;

    const recognition = new Ctor();
    recognition.lang = SPEECH_LANG[answerLanguage];
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript ?? "";
      // Confirmed on screen rather than sent immediately — a misheard word
      // has no way to be proof-read after the fact by someone who may not
      // read well in the first place.
      setPendingTranscript(transcript);
    };
    recognition.onerror = () => {
      toast.error(t.ask.notCaught);
      setListening(false);
    };
    recognition.onend = () => setListening(false);

    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }

  function stopListening() {
    recognitionRef.current?.stop();
    setListening(false);
  }

  const answerIsRtl = answerLanguage === "ur";
  // In the widget the presets are a starting nudge, not a permanent panel —
  // once a conversation is underway the small space is better spent on it.
  const showPresets = !compact || messages.length === 0;
  // Derived from the messages already in state rather than tracked separately,
  // so it cannot drift from the per-answer figures shown above it.
  const sessionCostPkr = messages.reduce((total, message) => total + (message.costPkr ?? 0), 0);

  return (
    <div className={compact ? "flex min-h-0 flex-1 flex-col" : "space-y-5"}>
      {/* Which language the *answer* comes back in. Labelled, because an
          unlabelled row of language names in an app that also has a language
          setting reads as that setting — and it is not one. Each name stays in
          its own script, so this row looks the same whatever the interface
          language is. */}
      <div className={compact ? "shrink-0" : ""}>
        <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
          {t.ask.answerLanguage}
        </p>
        <div className="flex gap-2">
          {(Object.keys(LANGUAGE_LABELS) as AnswerLanguage[]).map((lang) => (
            <button
              key={lang}
              type="button"
              onClick={() => setAnswerLanguage(lang)}
              className={cn(
                "flex-1 rounded-2xl font-bold transition-all",
                compact ? "px-2 py-1.5 text-xs" : "px-3 py-2.5 text-sm",
                answerLanguage === lang
                  ? "bg-primary text-primary-foreground shadow-[0_10px_24px_rgb(239_86_25/0.25)]"
                  : "bg-secondary text-muted-foreground hover:text-foreground",
              )}
            >
              {LANGUAGE_LABELS[lang]}
            </button>
          ))}
        </div>
      </div>

      <div className={cn("flex gap-1.5", compact ? "mt-1.5" : "mt-2")}>
        {EFFORT_LEVELS.map((level) => {
          // The ladder carries the order and the allowlist; the words are in
          // the dictionary, keyed by the same five values.
          const words = t.ask.effort[level.value];

          return (
            <button
              key={level.value}
              type="button"
              onClick={() => setEffort(level.value)}
              title={compact ? `${words.label} — ${words.hint}` : words.hint}
              className={cn(
                "flex-1 rounded-2xl font-bold transition-all",
                compact ? "px-2 py-1.5 text-[0.65rem]" : "px-3 py-2 text-xs",
                effort === level.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground hover:text-foreground",
              )}
            >
              {compact ? words.short : words.label}
            </button>
          );
        })}
      </div>
      {sessionCostPkr > 0 ? (
        <p className={cn("mt-1 text-muted-foreground", compact ? "text-[0.65rem]" : "text-xs")}>
          {/* The currency and the figure are one Latin run — "Rs" is written
              beside the digits the way the attendance log and the pay rates
              screen write money, and the sentence around it reorders without
              splitting it. */}
          <Fill
            template={t.ask.sessionCost}
            values={{ amount: `Rs ${sessionCostPkr.toLocaleString("en-PK")}` }}
          />
        </p>
      ) : null}

      {showPresets ? (
        <div className={compact ? "mt-3 shrink-0" : ""}>
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            {t.ask.commonQuestions}
          </p>
          <div className={cn("grid gap-2", !compact && "sm:grid-cols-2")}>
            {(presets ?? PRESETS).map((preset) => (
              <button
                key={preset.en}
                type="button"
                disabled={loading}
                onClick={() => ask(presetText(preset, answerLanguage))}
                dir={answerIsRtl ? "rtl" : "ltr"}
                className={cn(
                  "rounded-2xl bg-secondary text-start font-semibold text-foreground transition-all hover:bg-primary-soft hover:text-primary disabled:opacity-50",
                  compact ? "px-3 py-2.5 text-xs" : "px-4 py-3.5 text-sm",
                )}
              >
                {presetText(preset, answerLanguage)}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div
        ref={scrollRef}
        className={cn(
          "space-y-3 overflow-y-auto",
          compact ? "mt-3 min-h-0 flex-1 pe-1" : "max-h-[50vh] min-h-[12rem] pe-1",
        )}
      >
        {messages.length === 0 ? (
          compact ? null : (
            <p
              dir={answerIsRtl ? "rtl" : "ltr"}
              className="rounded-2xl bg-secondary px-4 py-6 text-center text-sm text-muted-foreground"
            >
              {greeting ?? GREETING[answerLanguage](firstName)}
            </p>
          )
        ) : (
          messages.map((message, i) => (
            <div
              key={i}
              dir={answerIsRtl ? "rtl" : "ltr"}
              className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}
            >
              <div
                className={cn(
                  "max-w-[85%] rounded-2xl px-4 py-3 text-sm",
                  message.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-foreground",
                )}
              >
                <p>{message.text}</p>
                {message.role === "assistant" && typeof message.costPkr === "number" ? (
                  <p
                    className={cn(
                      "mt-1 font-semibold text-muted-foreground",
                      compact ? "text-[0.65rem]" : "text-xs",
                    )}
                  >
                    <Latin>Rs {message.costPkr.toLocaleString("en-PK")}</Latin>
                  </p>
                ) : null}
                {message.role === "assistant" ? (
                  <button
                    type="button"
                    onClick={() => speak(message.text)}
                    aria-label={t.ask.readAloud}
                    className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
                  >
                    <Volume2 className="size-3.5" />
                    {t.ask.listen}
                  </button>
                ) : null}
              </div>
            </div>
          ))
        )}
        {loading ? (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 rounded-2xl bg-secondary px-4 py-3 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {t.ask.thinking}
            </div>
          </div>
        ) : null}
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          ask(input);
        }}
        className={cn("flex items-center gap-2", compact ? "mt-3 shrink-0" : "mt-4")}
      >
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          dir={answerIsRtl ? "rtl" : "ltr"}
          placeholder={t.ask.placeholder}
          className={cn(
            "min-w-0 flex-1 rounded-2xl border border-input bg-background text-sm outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/30",
            compact ? "px-3 py-2.5" : "px-4 py-3",
          )}
        />

        {speechSupported ? (
          <button
            type="button"
            onClick={listening ? stopListening : startListening}
            aria-label={listening ? t.ask.stopListening : t.ask.askByVoice}
            className={cn(
              "flex shrink-0 items-center justify-center rounded-2xl transition-all",
              compact ? "size-10" : "size-12",
              listening
                ? "animate-pulse bg-danger text-white"
                : "bg-secondary text-foreground hover:bg-primary-soft hover:text-primary",
            )}
          >
            {listening ? (
              <Square className="size-4" />
            ) : (
              <Mic className={compact ? "size-4" : "size-5"} />
            )}
          </button>
        ) : null}

        <button
          type="submit"
          disabled={loading || !input.trim()}
          aria-label={t.ask.send}
          className={cn(
            "flex shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground transition-all hover:-translate-y-0.5 disabled:opacity-50",
            compact ? "size-10" : "size-12",
          )}
        >
          <Send className={compact ? "size-4" : "size-5"} />
        </button>
      </form>

      {pendingTranscript !== null ? (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-charcoal/40 p-3 backdrop-blur-sm sm:items-center">
          <div className="w-full max-w-md rounded-3xl bg-card p-6 shadow-[0_18px_40px_rgb(0_0_0/0.18)]">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              {t.ask.heard}
            </p>
            <p
              dir={answerIsRtl ? "rtl" : "ltr"}
              className="mt-3 rounded-2xl bg-secondary px-4 py-4 text-lg font-semibold text-foreground"
            >
              {pendingTranscript || t.ask.nothingHeard}
            </p>
            <div className="mt-4 flex gap-3">
              <button
                type="button"
                onClick={() => setPendingTranscript(null)}
                className="flex-1 rounded-2xl bg-secondary px-4 py-3 text-sm font-bold text-foreground transition-all hover:text-primary"
              >
                {t.ask.retry}
              </button>
              <button
                type="button"
                disabled={!pendingTranscript}
                onClick={() => {
                  const question = pendingTranscript ?? "";
                  setPendingTranscript(null);
                  ask(question);
                }}
                className="flex-1 rounded-2xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground shadow-[0_10px_24px_rgb(239_86_25/0.25)] transition-all hover:-translate-y-0.5 disabled:opacity-50"
              >
                {t.ask.send}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
