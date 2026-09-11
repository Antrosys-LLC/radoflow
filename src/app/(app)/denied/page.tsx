import Link from "next/link";
import { ShieldAlert } from "lucide-react";

import { Fill } from "@/components/fill";
import { Card } from "@/components/ui-kit";
import { requireSession } from "@/lib/auth/session";
import { dictionaryFor } from "@/lib/i18n";
import { landingPathFor } from "@/lib/navigation";

export default async function DeniedPage() {
  const session = await requireSession();
  const t = dictionaryFor(session.profile.language);

  // Role names are data the office typed, so they render as stored. With no
  // role at all there is no name to put in the sentence, and the shared
  // "no role assigned" phrase is what belongs there instead.
  const roleLabel = session.roles.map((r) => r.name).join(" · ") || t.common.noRole;

  return (
    <Card className="mx-auto max-w-md text-center">
      <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-danger-soft text-danger">
        <ShieldAlert className="size-6" />
      </span>
      <h1 className="mt-4 text-lg font-bold text-foreground">{t.errors.deniedTitle}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        <Fill template={t.errors.deniedBody} values={{ role: roleLabel }} />
      </p>
      <Link
        href={landingPathFor(session)}
        className="mt-5 inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground transition-all hover:-translate-y-0.5"
      >
        {t.errors.backToDashboard}
      </Link>
    </Card>
  );
}
