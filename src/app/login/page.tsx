import type { Metadata } from "next";

import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: { absolute: "Sign in | Rado Attendance & Payroll" },
  description: "Sign in to the Rado Dyeing and Textile attendance and payroll system.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return <LoginForm next={next ?? "/"} />;
}
