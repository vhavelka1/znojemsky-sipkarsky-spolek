export default function Home() {
  return (
    <main className="min-h-screen bg-slate-100">
      <div className="container mx-auto px-6 py-20">
        <h1 className="text-5xl font-bold text-slate-900">
          Znojemský šipkařský spolek
        </h1>

        <p className="mt-6 text-xl text-slate-600">
          Informační systém pro správu ligy, turnajů, týmů a hráčů.
        </p>

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          <div className="rounded-xl bg-white p-6 shadow">
            <h2 className="text-xl font-semibold">Liga</h2>
            <p className="mt-2 text-slate-600">
              Tabulky, výsledky a statistiky týmů.
            </p>
          </div>

          <div className="rounded-xl bg-white p-6 shadow">
            <h2 className="text-xl font-semibold">Turnaje</h2>
            <p className="mt-2 text-slate-600">
              Mini turnaje, major turnaje a žebříčky hráčů.
            </p>
          </div>

          <div className="rounded-xl bg-white p-6 shadow">
            <h2 className="text-xl font-semibold">Hráči</h2>
            <p className="mt-2 text-slate-600">
              Evidence hráčů, týmů a přestupů.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}