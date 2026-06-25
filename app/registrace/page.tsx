import Link from "next/link";
import { PublicHero, PublicPageShell } from "@/components/public/PublicShell";

const cards = [
  {
    href: "/registrace/tym",
    title: "Registrace týmu",
    text: "Přihláška týmu do nové sezóny včetně soupisky hráčů a kontaktu na kapitána.",
    action: "Registrovat tým",
  },
  {
    href: "/registrace/jednotlivec",
    title: "Registrace jednotlivce",
    text: "Přihláška hráče, který hledá tým nebo chce potvrdit zájem o účast v sezóně.",
    action: "Registrovat hráče",
  },
];

export default function RegistrationLandingPage() {
  return (
    <PublicPageShell activeHref="/registrace">
      <PublicHero
        eyebrow="Registrace"
        title="Přihlášky do sezóny"
        description="Vyberte registraci týmu nebo jednotlivce. Žádosti následně zkontroluje moderátor nebo administrátor."
      />

      <section className="mx-auto grid max-w-7xl gap-6 px-4 py-12 sm:px-6 md:grid-cols-2 lg:px-8">
        {cards.map((card) => (
          <Link
            className="group rounded-[28px] border border-[#D8E4F2] bg-white p-7 shadow-[0_18px_50px_rgba(6,26,58,0.10)] transition hover:-translate-y-1 hover:shadow-[0_24px_70px_rgba(6,26,58,0.16)]"
            href={card.href}
            key={card.href}
          >
            <p className="text-sm font-black uppercase tracking-[0.18em] text-[#EF233C]">ZŠS</p>
            <h2 className="mt-4 text-3xl font-black text-[#061A3A]">{card.title}</h2>
            <p className="mt-3 text-base font-bold leading-7 text-slate-600">{card.text}</p>
            <span className="mt-7 inline-flex rounded-full bg-[#EF233C] px-5 py-3 text-sm font-black text-white transition group-hover:bg-red-500">
              {card.action}
            </span>
          </Link>
        ))}
      </section>
    </PublicPageShell>
  );
}
