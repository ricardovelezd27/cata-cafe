"use server";

// Thin form-shaped wrappers around the real join actions, built for React 19
// useActionState (components/join/JoinSessionForm.tsx, JoinCoffeeForm.tsx).
// joinViaToken (community.ts) and joinCoffeeViaToken (coffees.ts) redirect()
// on success — that throw passes straight through run() via unstable_rethrow
// — and only surface an ActionResult when the token turns out to be
// invalid/expired/exhausted.

import { joinViaToken } from "@/app/actions/community";
import { joinCoffeeViaToken } from "@/app/actions/coffees";
import { run } from "@/lib/safeAction";
import type { ActionResult } from "@/lib/actionResult";

export type JoinFormState = ActionResult<void> | null;

function readTokenAndLocale(formData: FormData): { token: string; locale: string } {
  const token = String(formData.get("token") ?? "");
  const locale = String(formData.get("locale") ?? "es");
  return { token, locale };
}

export async function joinSessionForm(
  _prev: JoinFormState,
  formData: FormData,
): Promise<JoinFormState> {
  const { token, locale } = readTokenAndLocale(formData);
  return run("joinSessionForm", async () => {
    await joinViaToken(token, locale);
  });
}

export async function joinCoffeeForm(
  _prev: JoinFormState,
  formData: FormData,
): Promise<JoinFormState> {
  const { token, locale } = readTokenAndLocale(formData);
  return run("joinCoffeeForm", async () => {
    await joinCoffeeViaToken(token, locale);
  });
}
