"use server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { cookieSecure } from "@/lib/supabase/cookie-secure";
import { createClient } from "@/lib/supabase/server";
import { nomeDoCookieDoMenu } from "@/lib/shell/sidebar-cookie";

export async function toggleSidebar(currentlyCollapsed: boolean): Promise<void> {
  // O usuário vem do servidor (JWT validado), nunca do cliente.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const store = await cookies();
  store.set(nomeDoCookieDoMenu(user.id), currentlyCollapsed ? "0" : "1", {
    httpOnly: true,
    sameSite: "strict",
    secure: cookieSecure(),
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/app", "layout");
}
