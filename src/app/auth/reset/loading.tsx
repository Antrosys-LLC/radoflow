import { PageSkeleton } from "@/components/page-skeleton";

/**
 * The recovery code is exchanged on the server before this page renders, which
 * is a network round trip to Supabase Auth. Without this the browser shows
 * nothing at all for that moment — on the one screen where a blank page reads
 * as "the link is broken".
 */
export default function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md">
        <PageSkeleton rows={2} stats={0} />
      </div>
    </div>
  );
}
