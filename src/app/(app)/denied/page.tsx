import Link from "next/link";
import { ShieldAlert } from "lucide-react";

import { Card } from "@/components/ui-kit";
import { requireSession } from "@/lib/auth/session";
import { landingPathFor } from "@/lib/navigation";

export default async function DeniedPage() {
  const session = await requireSession();
  const roleLabel = session.roles.map((r) => r.name).join(" · ") || "your";

  return (
    <Card className="mx-auto max-w-md text-center">
      <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-danger-soft text-danger">
        <ShieldAlert className="size-6" />
      </span>
      <h1 className="mt-4 text-lg font-bold text-foreground">Not available for your role</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        The {roleLabel} role does not include this module. If you need access, ask an
        administrator to grant it — no reinstall or update is required.
      </p>
      <Link
        href={landingPathFor(session)}
        className="mt-5 inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground transition-all hover:-translate-y-0.5"
      >
        Back to my dashboard
      </Link>
    </Card>
  );
}
