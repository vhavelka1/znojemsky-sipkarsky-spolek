import Link from "next/link";
import { Card, PageHeader } from "@/components/ui/admin";

export default function AdminImportPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        description="Nástroje pro hromadné nahrání dat do administrace."
        title="Import"
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Link href="/admin/import/zapasy">
          <Card className="h-full transition hover:-translate-y-0.5 hover:border-[var(--brand-blue)]">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--brand-coral)]">CSV</p>
            <h3 className="mt-2 text-xl font-black text-[var(--brand-navy)]">Import zápasů</h3>
            <p className="mt-2 text-sm font-semibold text-[var(--admin-muted)]">
              Nahraje rozpis zápasů, založí chybějící skupiny, týmy a vazby v soutěži.
            </p>
          </Card>
        </Link>
      </div>
    </div>
  );
}
