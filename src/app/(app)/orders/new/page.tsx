import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requirePageUser } from "@/server/auth/session";
import { CreateOrderForm } from "./create-order-form";

export const metadata: Metadata = { title: "New order" };

export default async function NewOrderPage() {
  const user = await requirePageUser();
  if (user.role !== "customer") redirect("/admin/orders");
  return (
    <div className="max-w-lg">
      <h1 className="text-xl font-semibold tracking-tight">New order</h1>
      <p className="mt-1 text-sm text-ink-muted">
        We create the mailboxes on your domain and warm them up. Make sure the domain&apos;s DNS points at the provider you pick.
      </p>
      <CreateOrderForm />
    </div>
  );
}
