"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type LoginState = {
  step: "email" | "code";
  email: string;
  error?: string;
  notice?: string;
};

const emailSchema = z.email().max(254);
const codeSchema = z.string().regex(/^\d{6,10}$/);

/** One action for both steps, chosen by the submitted "intent". */
export async function loginAction(
  prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const intent = formData.get("intent");
  if (intent === "change-email") return { step: "email", email: prev.email };
  if (intent === "verify") return verifyCode(prev, formData);
  return sendCode(formData);
}

async function sendCode(formData: FormData): Promise<LoginState> {
  const raw = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const parsed = emailSchema.safeParse(raw);
  if (!parsed.success) {
    return { step: "email", email: raw, error: "Enter a valid email address." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data,
    // Invite-only: never create an account from the login page.
    options: { shouldCreateUser: false },
  });

  if (error?.code === "over_email_send_rate_limit" || error?.status === 429) {
    return {
      step: "email",
      email: parsed.data,
      error: "Too many codes requested. Wait a minute, then try again.",
    };
  }

  // "otp_disabled" / "signup_disabled" mean the address has no account. Treat that like
  // success so the page can't be used to discover who has an account.
  const unknownAddress =
    error?.code === "otp_disabled" || error?.code === "signup_disabled";
  if (error && !unknownAddress) {
    // A real problem (email provider off, mail server down). Log without the address.
    console.error(
      "Sign-in code not sent:",
      error.code ?? error.status,
      error.message,
    );
    return {
      step: "email",
      email: parsed.data,
      error: "Couldn't send a code right now. Try again in a few minutes.",
    };
  }

  return {
    step: "code",
    email: parsed.data,
    notice: `If ${parsed.data} is part of a Caddy household, a sign-in code is on its way.`,
  };
}

async function verifyCode(
  prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = prev.email;
  const code = String(formData.get("code") ?? "").replace(/\s+/g, "");
  if (!emailSchema.safeParse(email).success) {
    return { step: "email", email: "", error: "Enter your email again." };
  }
  if (!codeSchema.safeParse(code).success) {
    return {
      step: "code",
      email,
      error: "Enter the code from the email, digits only.",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    email,
    token: code,
    type: "email",
  });
  if (error) {
    return {
      step: "code",
      email,
      error: "That code didn't work. It may have expired: request a new one.",
    };
  }
  redirect("/");
}
