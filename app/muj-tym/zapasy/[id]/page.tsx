import AdminMatchSheetPage from "../../../admin/matches/[id]/page";
import { PublicPageShell } from "@/components/public/PublicShell";

export default function MyTeamMatchSheetPage() {
  return (
    <PublicPageShell activeHref="/tymy">
      <section className="bg-[#061A3A] text-white">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#EF233C]">Kapitánská sekce</p>
          <h1 className="mt-2 text-4xl font-black tracking-tight">Zápis zápasu</h1>
          <p className="mt-2 max-w-3xl text-base font-bold text-blue-100">Doplnění sestavy, legů, výsledku a výkonů hráčů.</p>
        </div>
      </section>
      <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <AdminMatchSheetPage backHref="/muj-tym/zapasy" backLabel="Zpět na zápasy týmu" scoreboardHref={null} teamView />
      </section>
    </PublicPageShell>
  );
}
