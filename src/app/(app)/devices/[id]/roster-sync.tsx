"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Users } from "lucide-react";
import { toast } from "sonner";

import { useDictionary } from "@/components/language-provider";

import { pushRosterToDevice } from "../actions";

/**
 * The button that repopulates one terminal.
 *
 * Deliberately separate from `DeviceControls`, whose two buttons both open a
 * TCP socket to the device and are therefore useless on a push-mode terminal.
 * This one only writes queue rows, so it works on exactly the terminals those
 * do not.
 */
export function RosterSyncButton({ deviceId }: { deviceId: string }) {
  const t = useDictionary();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function push() {
    startTransition(async () => {
      const toastId = toast.loading(t.devices.rosterQueuing);
      const result = await pushRosterToDevice(deviceId);
      toast.dismiss(toastId);

      if (result.ok) toast.success(result.message, { duration: 6000 });
      else toast.error(result.message, { duration: 8000 });

      router.refresh();
    });
  }

  return (
    <button
      type="button"
      disabled={pending}
      onClick={push}
      className="mt-5 inline-flex items-center gap-2 rounded-xl bg-secondary px-4 py-2.5 text-sm font-semibold text-foreground transition-all hover:bg-primary-soft hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
    >
      <Users className="size-4" />
      {t.devices.rosterPushAll}
    </button>
  );
}
