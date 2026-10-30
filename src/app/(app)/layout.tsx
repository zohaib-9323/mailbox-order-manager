import { AppHeader } from "@/components/app-header";
import { requirePageUser } from "@/server/auth/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser();
  return (
    <>
      <AppHeader user={user} />
      <main className="mx-auto max-w-6xl px-5 py-8">{children}</main>
    </>
  );
}
