import Image from "next/image";
import Link from "next/link";

type PlayerDetailPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function PlayerDetailPage({ params }: PlayerDetailPageProps) {
  const { id } = await params;

  return (
    <main className="min-h-screen bg-[#F4F8FF] text-[#0B1F3A]">
      <header className="border-b border-white/10 bg-[#061A3A] text-white shadow-[0_14px_40px_rgba(6,26,58,0.22)]">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-5 px-4 py-3 sm:px-6 lg:px-8">
          <Link aria-label="Znojemský šipkařský spolek" className="flex items-center gap-3" href="/">
            <Image
              alt="Logo Znojemského šipkařského spolku"
              className="h-14 w-14 rounded-2xl object-contain shadow-lg shadow-black/25"
              height={256}
              priority
              src="/brand/zss-logo-official.png"
              width={256}
            />
            <div className="hidden leading-tight sm:block">
              <p className="text-sm font-black uppercase tracking-[0.14em]">Znojemský</p>
              <p className="text-lg font-black uppercase tracking-[0.08em] text-[#3B82F6]">Šipkařský spolek</p>
            </div>
          </Link>
          <Link className="rounded-full bg-white px-4 py-2 text-sm font-black text-[#061A3A]" href="/hraci">
            Zpět na hráče
          </Link>
        </div>
      </header>

      <section className="relative isolate overflow-hidden bg-[#061A3A] text-white">
        <div className="absolute inset-0 -z-20 bg-[radial-gradient(circle_at_20%_15%,rgba(59,130,246,0.36),transparent_34%),radial-gradient(circle_at_90%_40%,rgba(239,35,60,0.24),transparent_30%),linear-gradient(135deg,#061A3A_0%,#0B2F6B_52%,#061A3A_100%)]" />
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
          <p className="inline-flex rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-blue-100">
            Profil hráče
          </p>
          <h1 className="mt-6 text-5xl font-black tracking-tight sm:text-6xl">Detail hráče</h1>
          <p className="mt-5 max-w-3xl text-xl font-bold leading-8 text-blue-100">
            Detail hráče připravujeme.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="rounded-[32px] border border-[#D8E4F2] bg-white p-6 shadow-[0_20px_60px_rgba(6,26,58,0.08)]">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#EF233C]">ID hráče</p>
          <p className="mt-2 break-all font-mono text-sm font-bold text-slate-600">{id}</p>
          <h2 className="mt-6 text-2xl font-black text-[#061A3A]">Detail hráče připravujeme.</h2>
          <p className="mt-3 text-sm font-bold leading-6 text-slate-600">
            Později zde budou tým, sezónní statistiky, výkony a historie zápasů.
          </p>
        </div>
      </section>
    </main>
  );
}
