import { Suspense } from "react";
import { AccessForm } from "./access-form";

export default function AccessPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-white">
      <div className="w-full max-w-sm space-y-6 rounded-2xl border border-slate-700 bg-slate-900 p-8">
        <header>
          <p className="text-sm font-semibold uppercase tracking-widest text-cyan-400">
            GrowthLoop AI
          </p>
          <h1 className="mt-2 text-2xl font-bold">Enter the demo access code</h1>
          <p className="mt-2 text-sm text-slate-400">
            The shared code protects this demo. It does not identify who you are.
          </p>
        </header>
        <Suspense fallback={<p className="text-slate-400">Loading…</p>}>
          <AccessForm />
        </Suspense>
      </div>
    </main>
  );
}
