import type { Metadata } from "next";
import Link from "next/link";
import { PublicHero, PublicPageShell } from "@/components/public/PublicShell";

export const metadata: Metadata = {
  title: "Ochrana osobních údajů | Znojemský šipkařský spolek",
  description: "Stručné informace o zpracování osobních údajů na webu Znojemského šipkařského spolku.",
};

export default function PrivacyPolicyPage() {
  return (
    <PublicPageShell activeHref="/ochrana-osobnich-udaju">
      <PublicHero
        eyebrow="Informace"
        title="Ochrana osobních údajů"
        description="Stručné zásady zpracování osobních údajů při používání webu Znojemského šipkařského spolku."
      />

      <section className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
        <article className="rounded-[28px] border border-[#D8E4F2] bg-white p-6 shadow-[0_20px_60px_rgba(6,26,58,0.08)] sm:p-8">
          <div className="space-y-8 text-base font-semibold leading-8 text-slate-700">
            <section>
              <h2 className="text-2xl font-black tracking-tight text-[#061A3A]">Provozovatel webu</h2>
              <p className="mt-3">
                Provozovatelem webu je Znojemský šipkařský spolek. Web slouží k provozu, organizaci a prezentaci
                šipkařských soutěží, týmů, zápasů, turnajů a souvisejících sportovních výsledků.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-black tracking-tight text-[#061A3A]">Jaké údaje mohou být zpracovávány</h2>
              <p className="mt-3">
                V souvislosti s používáním webu mohou být zpracovávány údaje související s uživatelskými účty,
                správou soutěží a komunikací s uživateli. Web může evidovat také údaje hráčů, týmů, zápasů,
                soupisek, výsledků a sportovních statistik.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-black tracking-tight text-[#061A3A]">Meta/Facebook integrace</h2>
              <p className="mt-3">
                Pokud je použita integrace s Facebookem/Meta, aplikace používá Meta Graph API pouze pro funkce
                související se správou Facebook stránky spolku, například pro publikování příspěvků. Přístupové údaje
                a tokeny Meta se na této stránce nezobrazují.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-black tracking-tight text-[#061A3A]">Předávání a prodej údajů</h2>
              <p className="mt-3">
                Osobní údaje nejsou prodávány třetím stranám. Údaje jsou používány pro provoz webu, správu soutěží a
                související činnosti spolku.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-black tracking-tight text-[#061A3A]">Práva uživatelů</h2>
              <p className="mt-3">
                Uživatel může požádat o informace, opravu nebo odstranění svých osobních údajů. Žádost lze zaslat na
                e-mail{" "}
                <a className="font-black text-[#0F4FA8] underline decoration-[#D8E4F2] underline-offset-4" href="mailto:havelka.vit@gmail.com">
                  havelka.vit@gmail.com
                </a>
                .
              </p>
              <p className="mt-3">
                Postup pro odstranění údajů je popsán na stránce{" "}
                <Link className="font-black text-[#0F4FA8] underline decoration-[#D8E4F2] underline-offset-4" href="/smazani-dat">
                  Žádost o odstranění osobních údajů
                </Link>
                .
              </p>
            </section>
          </div>
        </article>
      </section>
    </PublicPageShell>
  );
}
