"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Mic, Send, Square, Volume2 } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";

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

export type Language = "ur" | "roman-ur" | "en";

const LANGUAGE_LABEL: Record<Language, string> = {
  ur: "اردو",
  "roman-ur": "Roman Urdu",
  en: "English",
};

const SPEECH_LANG: Record<Language, string> = {
  ur: "ur-PK",
  "roman-ur": "ur-PK",
  en: "en-US",
};

interface Preset {
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

function presetText(preset: Preset, language: Language): string {
  if (language === "ur") return preset.ur;
  if (language === "roman-ur") return preset.romanUr;
  return preset.en;
}

const GREETING: Record<Language, (name: string) => string> = {
  ur: (name) => `السلام علیکم ${name}، کیا پوچھنا چاہتے ہیں؟`,
  "roman-ur": (name) => `Assalam-o-Alaikum ${name}, kya poochna chahte hain?`,
  en: (name) => `Hi ${name}, what would you like to know?`,
};

const COPY = {
  common: { ur: "عام سوالات", "roman-ur": "Aam sawalat", en: "Common questions" },
  thinking: { ur: "سوچ رہا ہوں…", "roman-ur": "Sochh raha hoon…", en: "Thinking…" },
  listen: { ur: "سنیں", "roman-ur": "Suno", en: "Listen" },
  placeholder: {
    ur: "یہاں سوال لکھیں…",
    "roman-ur": "Sawal likhein…",
    en: "Type your question…",
  },
  heard: {
    ur: "کیا آپ نے یہ پوچھا؟",
    "roman-ur": "Kya aap ne yeh poocha?",
    en: "Did you ask this?",
  },
  nothingHeard: { ur: "(کچھ نہیں سنا)", "roman-ur": "(kuch nahi suna)", en: "(nothing heard)" },
  retry: { ur: "دوبارہ", "roman-ur": "Dobara", en: "Try again" },
  send: { ur: "بھیجیں", "roman-ur": "Bhejein", en: "Send" },
} as const;

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
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

/** Reads the saved language once, at mount — avoids a render just to apply it. */
function initialLanguage(): Language {
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
}: {
  firstName: string;
  /** The floating widget: tighter spacing, presets only while the thread is empty. */
  compact?: boolean;
}) {
  const [language, setLanguage] = useState<Language>(initialLanguage);
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
      window.localStorage.setItem("radoflow-assistant-language", language);
    } catch {
      // Convenience only — nothing breaks if this can't be saved.
    }
  }, [language]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  function speak(text: string) {
    if (!("speechSynthesis" in window)) return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = SPEECH_LANG[language];
      window.speechSynthesis.speak(utterance);
    } catch {
      // Not every device has a matching voice installed — fail silently;
      // the text answer is still on screen either way.
    }
  }

  async function ask(question: string) {
    const trimmed = question.trim();
    if (!trimmed || loading) return;

    setMessages((prev) => [...prev, { role: "user", text: trimmed }]);
    setInput("");
    setLoading(true);

    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: trimmed, language }),
      });
      const body = (await response.json().catch(() => null)) as {
        answer?: string;
        error?: string;
      } | null;

      if (!response.ok || !body?.answer) {
        toast.error(body?.error ?? "Could not get an answer just now.");
        setMessages((prev) => prev.slice(0, -1));
        return;
      }

      setMessages((prev) => [...prev, { role: "assistant", text: body.answer! }]);
      speak(body.answer);
    } catch {
      toast.error("Could not reach the assistant. Check your connection.");
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
    recognition.lang = SPEECH_LANG[language];
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
      toast.error("Didn't catch that — try again, or type your question.");
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

  const isRtl = language === "ur";
  // In the widget the presets are a starting nudge, not a permanent panel —
  // once a conversation is underway the small space is better spent on it.
  const showPresets = !compact || messages.length === 0;

  return (
    <div className={compact ? "flex min-h-0 flex-1 flex-col" : "space-y-5"}>
      <div className={cn("flex gap-2", compact && "shrink-0")}>
        {(Object.keys(LANGUAGE_LABEL) as Language[]).map((lang) => (
          <button
            key={lang}
            type="button"
            onClick={() => setLanguage(lang)}
            className={cn(
              "flex-1 rounded-2xl font-bold transition-all",
              compact ? "px-2 py-1.5 text-xs" : "px-3 py-2.5 text-sm",
              language === lang
                ? "bg-primary text-primary-foreground shadow-[0_10px_24px_rgb(239_86_25/0.25)]"
                : "bg-secondary text-muted-foreground hover:text-foreground",
            )}
          >
            {LANGUAGE_LABEL[lang]}
          </button>
        ))}
      </div>

      {showPresets ? (
        <div className={compact ? "mt-3 shrink-0" : ""}>
          <p
            dir={isRtl ? "rtl" : "ltr"}
            className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground"
          >
            {COPY.common[language]}
          </p>
          <div className={cn("grid gap-2", !compact && "sm:grid-cols-2")}>
            {PRESETS.map((preset) => (
              <button
                key={preset.en}
                type="button"
                disabled={loading}
                onClick={() => ask(presetText(preset, language))}
                dir={isRtl ? "rtl" : "ltr"}
                className={cn(
                  "rounded-2xl bg-secondary text-left font-semibold text-foreground transition-all hover:bg-primary-soft hover:text-primary disabled:opacity-50",
                  compact ? "px-3 py-2.5 text-xs" : "px-4 py-3.5 text-sm",
                )}
              >
                {presetText(preset, language)}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div
        ref={scrollRef}
        className={cn(
          "space-y-3 overflow-y-auto",
          compact ? "mt-3 min-h-0 flex-1 pr-1" : "max-h-[50vh] min-h-[12rem] pr-1",
        )}
      >
        {messages.length === 0 ? (
          compact ? null : (
            <p
              dir={isRtl ? "rtl" : "ltr"}
              className="rounded-2xl bg-secondary px-4 py-6 text-center text-sm text-muted-foreground"
            >
              {GREETING[language](firstName)}
            </p>
          )
        ) : (
          messages.map((message, i) => (
            <div
              key={i}
              dir={isRtl ? "rtl" : "ltr"}
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
                {message.role === "assistant" ? (
                  <button
                    type="button"
                    onClick={() => speak(message.text)}
                    aria-label="Read aloud"
                    className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
                  >
                    <Volume2 className="size-3.5" />
                    {COPY.listen[language]}
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
              {COPY.thinking[language]}
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
          dir={isRtl ? "rtl" : "ltr"}
          placeholder={COPY.placeholder[language]}
          className={cn(
            "min-w-0 flex-1 rounded-2xl border border-input bg-background text-sm outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/30",
            compact ? "px-3 py-2.5" : "px-4 py-3",
          )}
        />

        {speechSupported ? (
          <button
            type="button"
            onClick={listening ? stopListening : startListening}
            aria-label={listening ? "Stop listening" : "Ask by voice"}
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
          aria-label="Send"
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
              {COPY.heard[language]}
            </p>
            <p
              dir={isRtl ? "rtl" : "ltr"}
              className="mt-3 rounded-2xl bg-secondary px-4 py-4 text-lg font-semibold text-foreground"
            >
              {pendingTranscript || COPY.nothingHeard[language]}
            </p>
            <div className="mt-4 flex gap-3">
              <button
                type="button"
                onClick={() => setPendingTranscript(null)}
                className="flex-1 rounded-2xl bg-secondary px-4 py-3 text-sm font-bold text-foreground transition-all hover:text-primary"
              >
                {COPY.retry[language]}
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
                {COPY.send[language]}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
