import Link from "next/link";
import { Card, PageHeader } from "@/components/ui/admin";

export default function AdminExportPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        description="Nástroje pro stažení dat z administrace."
        title="Export"
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Link href="/admin/export/hraci-vsichni">
          <Card className="h-full transition hover:-translate-y-0.5 hover:border-[var(--brand-blue)]">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--brand-coral)]">CSV</p>
            <h3 className="mt-2 text-xl font-black text-[var(--brand-navy)]">Hráči - všichni</h3>
            <p className="mt-2 text-sm font-semibold text-[var(--admin-muted)]">
              Stáhne seznam hráčů se jménem, příjmením, týmem, datem narození, bydlištěm a aktivitou.
            </p>
          </Card>
        </Link>
      </div>
    </div>
  );
}
