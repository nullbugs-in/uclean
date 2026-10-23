"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/db/server";

export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/#hero");
}
