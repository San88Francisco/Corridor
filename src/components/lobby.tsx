"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { getPlayerToken, postJson } from "@/lib/client";

export function Lobby() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setPending(true);
    setError(null);
    try {
      const res = await postJson("/api/games", { token: getPlayerToken() });
      if (!res.ok) throw new Error(String(res.status));
      const { id }: { id: string } = await res.json();
      router.push(`/g/${id}`);
    } catch {
      setError("Не вдалося створити гру. Спробуйте ще раз.");
      setPending(false);
    }
  }

  function join(form: FormData) {
    const id = String(form.get("code") ?? "").trim().toUpperCase();
    if (id) router.push(`/g/${id}`);
  }

  return (
    <div className="mt-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <button
          type="button"
          onClick={create}
          disabled={pending}
          className="h-11 rounded-lg bg-accent-500 px-5 text-[15px] font-semibold text-navy-950 transition-colors hover:bg-accent-300 active:bg-accent-300 disabled:opacity-60"
        >
          {pending ? "Створюємо…" : "Створити гру"}
        </button>
        <span className="hidden text-[13.5px] text-ink-500 sm:inline">або</span>
        <form action={join} className="flex gap-2">
          <input
            name="code"
            required
            maxLength={5}
            autoComplete="off"
            placeholder="Код сесії"
            aria-label="Код сесії"
            className="h-11 w-full min-w-0 rounded-lg border border-navy-700 bg-navy-900 px-3.5 text-base font-medium tracking-[0.14em] text-white uppercase placeholder:font-normal placeholder:tracking-normal placeholder:text-ink-500 placeholder:normal-case focus:border-accent-500 focus:outline-none sm:w-36"
          />
          <button
            type="submit"
            className="h-11 shrink-0 rounded-lg border border-navy-700 px-4 text-[15px] font-semibold text-white transition-colors hover:bg-navy-900 active:bg-navy-800"
          >
            Приєднатися
          </button>
        </form>
      </div>
      {error && <p className="mt-3 text-[13.5px] text-accent-300">{error}</p>}
    </div>
  );
}
