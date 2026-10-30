import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");
  return (
    <main className="flex min-h-screen items-center justify-center px-5">
      <div className="w-full max-w-sm">
        <p className="font-mono text-[11px] uppercase tracking-wider text-ink-faint">internal tool</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Mailbox Orders</h1>
        <p className="mt-2 text-sm text-ink-muted">
          Order pre-warmed Google Workspace and Microsoft 365 mailboxes and follow them through provisioning.
        </p>
        <LoginForm />
        <div className="mt-8 border-t border-line pt-4 text-xs text-ink-muted">
          <p className="font-medium text-ink">Demo accounts</p>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono">
            <dt>admin</dt>
            <dd>admin@mailbox.test / admin1234</dd>
            <dt>customer</dt>
            <dd>alice@acme.test / customer1234</dd>
            <dt>customer</dt>
            <dd>bob@globex.test / customer1234</dd>
          </dl>
        </div>
      </div>
    </main>
  );
}
