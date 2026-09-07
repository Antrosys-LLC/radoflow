"use client";

import { MessageCircleQuestion } from "lucide-react";

import { AssistantConversation } from "@/components/assistant/assistant-conversation";
import { useDictionary } from "@/components/language-provider";
import { Card, SectionTitle } from "@/components/ui-kit";

/**
 * The full-page "Ask" screen.
 *
 * The same conversation as the floating widget in the app shell, given room
 * to breathe — a longer thread, the presets always visible. Everything that
 * actually handles voice, language and the API call lives in
 * AssistantConversation so the two surfaces cannot drift apart.
 */
export function AssistantClient({ firstName }: { firstName: string }) {
  const t = useDictionary();

  return (
    <div className="pb-6">
      <Card className="p-4 sm:p-6">
        <SectionTitle icon={MessageCircleQuestion} title={t.nav.ask} subtitle={t.ask.subtitle} />
        <AssistantConversation firstName={firstName} />
      </Card>
    </div>
  );
}
