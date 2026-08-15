"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { PlugZap, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { syncDevice, testConnection } from "../actions";

export function DeviceControls({
  deviceId,
  mode,
  hasAddress,
}: {
  deviceId: string;
  mode: string;
  hasAddress: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function run(action: () => Promise<{ ok: boolean; message: string }>, loading: string) {
    startTransition(async () => {
      const toastId = toast.loading(loading);
      const result = await action();
      toast.dismiss(toastId);
      if (result.ok) toast.success(result.message, { duration: 6000 });
      else toast.error(result.message, { duration: 8000 });
      router.refresh();
    });
  }

  return (
    <div className="mt-5 flex flex-wrap gap-3">
      <button
        type="button"
        disabled={pending || !hasAddress}
        onClick={() => run(() => testConnection(deviceId), "Contacting terminal…")}
        title={hasAddress ? undefined : "Add the terminal's IP address first"}
        className="inline-flex items-center gap-2 rounded-xl bg-secondary px-4 py-2.5 text-sm font-semibold text-foreground transition-all hover:bg-primary-soft hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
      >
        <PlugZap className="size-4" />
        Test connection
      </button>

      <button
        type="button"
        disabled={pending || !hasAddress}
        onClick={() => run(() => syncDevice(deviceId), "Reading attendance log…")}
        title={hasAddress ? undefined : "Add the terminal's IP address first"}
        className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground shadow-[0_10px_24px_rgb(239_86_25/0.25)] transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
      >
        <RefreshCw className={pending ? "size-4 animate-spin" : "size-4"} />
        Sync attendance now
      </button>

      {mode === "push" ? (
        <p className="w-full text-xs text-muted-foreground">
          This terminal is in push mode, so it uploads on its own. These controls are for pulling
          the stored log on demand and need the server to reach the device over the network.
        </p>
      ) : null}
    </div>
  );
}
