"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";

// Only same-origin paths, so `next` can't become an open redirect.
function safeNext(value: string | null): string {
  return value && /^\/(?![\\/])/.test(value) ? value : "/experiments";
}

export function AccessForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");

    const response = await fetch("/api/access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });

    if (response.ok) {
      router.replace(safeNext(searchParams.get("next")));
      router.refresh();
      return;
    }

    const body = await response.json().catch(() => ({}));
    setError(body.error ?? "Access failed.");
    setPending(false);
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <label className="grid gap-2">
        <span className="text-sm text-slate-300">Demo access code</span>
        <input
          type="password"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          autoComplete="off"
          required
          className="rounded-lg border border-slate-600 bg-slate-800 p-3 text-white"
        />
      </label>
      <button
        type="submit"
        disabled={pending || code.length === 0}
        className="rounded-lg bg-cyan-500 px-5 py-3 font-bold text-slate-950 hover:bg-cyan-400 disabled:opacity-40"
      >
        {pending ? "Checking…" : "Continue"}
      </button>
      {error && (
        <p role="alert" className="rounded-lg bg-red-950 p-3 text-red-200">
          {error}
        </p>
      )}
    </form>
  );
}
