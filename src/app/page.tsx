import { redirect } from "next/navigation";
import { requirePageUser } from "@/server/auth/session";

export default async function Home() {
  const user = await requirePageUser();
  redirect(user.role === "admin" ? "/admin/orders" : "/orders");
}
