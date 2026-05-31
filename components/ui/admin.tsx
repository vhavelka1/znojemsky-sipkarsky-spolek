import { ReactNode } from "react";

type ButtonProps = {
  children: ReactNode;
  type?: "button" | "submit" | "reset";
  variant?: "primary" | "secondary" | "danger";
  disabled?: boolean;
  onClick?: () => void;
};

export function Button({
  children,
  disabled = false,
  onClick,
  type = "button",
  variant = "primary",
}: ButtonProps) {
  const variants = {
    primary: "bg-[#0B2F6B] text-white shadow-[0_10px_22px_rgba(11,47,107,0.18)] hover:-translate-y-px hover:bg-[#061A3A]",
    secondary:
      "border border-[var(--admin-border)] bg-white text-[var(--brand-navy)] hover:bg-[#F4F8FF]",
    danger:
      "border border-red-200 bg-white text-[#EF233C] hover:bg-red-50",
  };

  return (
    <button
      className={`rounded-2xl px-4 py-2.5 text-sm font-black disabled:cursor-not-allowed disabled:opacity-60 ${variants[variant]}`}
      disabled={disabled}
      onClick={onClick}
      type={type}
    >
      {children}
    </button>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`admin-card p-5 sm:p-6 ${className}`}>{children}</section>;
}

export const AdminCard = Card;

export function PageHeader({
  eyebrow = "Administrace",
  title,
  description,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
}) {
  return (
    <header>
      <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--brand-coral)]">{eyebrow}</p>
      <h2 className="mt-2 text-3xl font-black tracking-tight text-[var(--brand-navy)]">{title}</h2>
      {description ? (
        <p className="mt-2 max-w-2xl text-sm text-[var(--admin-muted)]">{description}</p>
      ) : null}
    </header>
  );
}

export const AdminPageHeader = PageHeader;

export function AdminSection({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <Card>
      <h3 className="text-lg font-black text-[var(--brand-navy)]">{title}</h3>
      <div className="mt-5">{children}</div>
    </Card>
  );
}

export function Badge({ children }: { children: ReactNode }) {
  return <span className="admin-badge">{children}</span>;
}

export function StatCard({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <Card>
      <p className="text-sm font-bold text-[var(--admin-muted)]">{label}</p>
      <div className="mt-4 border-l-4 border-[var(--brand-coral)] pl-4 text-3xl font-black text-[var(--brand-navy)]">{value}</div>
    </Card>
  );
}

export const AdminButton = Button;

export function AdminTable({ children }: { children: ReactNode }) {
  return <div className="overflow-x-auto">{children}</div>;
}
