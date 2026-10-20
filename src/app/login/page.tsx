import { Brand } from "@/components/layout/brand";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <main className="mx-auto grid min-h-dvh max-w-sm content-center gap-6 px-4 py-10">
      <Brand />
      <div className="grid gap-1">
        <h1 className="text-[1.6rem] leading-tight font-bold">Sign in</h1>
        <p className="text-muted">
          We&apos;ll email you a 6-digit code. No password needed.
        </p>
      </div>
      <LoginForm />
      <p className="text-sm text-muted">
        Caddy is private to your household. Ask an adult in your household to
        invite you from Settings.
      </p>
    </main>
  );
}
