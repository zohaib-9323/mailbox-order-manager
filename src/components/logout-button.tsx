"use client";

import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api-client";

export function LogoutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={async () => {
        await apiFetch("/api/auth/logout", { method: "POST" });
        router.replace("/login");
        router.refresh();
      }}
      className="text-sm text-ink-muted underline-offset-4 hover:text-ink hover:underline"
    >
      Sign out
    </button>
  );
}
