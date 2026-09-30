import type { Metadata } from "next";
import { PublicHero, PublicPageShell } from "@/components/public/PublicShell";

export const metadata: Metadata = {
  title: "Žádost o odstranění osobních údajů | Znojemský šipkařský spolek",
  description: "Postup pro podání žádosti o odstranění osobních údajů souvisejících s webem Znojemského šipkařského spolku.",
};

export default function DataDeletionPage() {
  return (
    <PublicPageShell activeHref="/smazani-dat">
      <PublicHero
        eyebrow="Osobní údaje"
        title="Žádost o odstranění osobních údajů"
        description="Postup pro uživatele, kteří chtějí požádat o odstranění osobních údajů souvisejících s webem nebo účtem."
      />

      <section className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
        <article className="rounded-[28px] border border-[#D8E4F2] bg-white p-6 shadow-[0_20px_60px_rgba(6,26,58,0.08)] sm:p-8">
          <div className="space-y-8 text-base font-semibold leading-8 text-slate-700">
            <section>
              <h2 className="text-2xl font-black tracking-tight text-[#061A3A]">Jak podat žádost</h2>
              <p className="mt-3">
                Uživatel může požádat o odstranění osobních údajů souvisejících s používáním webu Znojemského
                šipkařského spolku nebo svého uživatelského účtu.
              </p>
              <ol className="mt-5 list-decimal space-y-3 pl-6">
                <li>
                  Žádost zašlete na e-mail{" "}
                  <a className="font-black text-[#0F4FA8] underline decoration-[#D8E4F2] underline-offset-4" href="mailto:havelka.vit@gmail.com">
                    havelka.vit@gmail.com
                  </a>
                  .
                </li>
                <li>Do předmětu zprávy uveďte „Žádost o odstranění osobních údajů“.</li>
                <li>Uveďte dostatek informací pro identifikaci příslušného účtu nebo údajů.</li>
                <li>
                  Po ověření žádosti budou příslušné osobní údaje odstraněny, pokud jejich další uchování nevyžaduje
                  zákonná povinnost.
                </li>
              </ol>
            </section>

            <section>
              <h2 className="text-2xl font-black tracking-tight text-[#061A3A]">Meta/Facebook integrace</h2>
              <p className="mt-3">
                Pokud uživatel udělil aplikaci přístup prostřednictvím Meta/Facebook, může požádat o odstranění údajů
                souvisejících s touto integrací stejným postupem. Do zprávy je vhodné uvést, že se žádost týká také
                Meta/Facebook integrace.
              </p>
            </section>
          </div>
        </article>
      </section>
    </PublicPageShell>
  );
}
