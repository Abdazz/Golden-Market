import { defineRouteConfig } from "@medusajs/admin-sdk";
import { Cash } from "@medusajs/icons";
import { useCallback, useEffect, useState } from "react";
import { api, formatXof } from "../../lib/deliveries";

// Page "Caisse" (spec 2026-09-28 journal-de-caisse) : solde, entrées et
// sorties du mois, chiffre d'affaires, écritures (automatiques : ventes,
// remboursements, frais de livraison ; manuelles : achats, publicité, solde
// initial, divers) et historique sur 12 mois. Pas de composant @medusajs/ui
// (conflit de types React 18/19) : HTML natif + classes utilitaires Medusa.

type Entry = {
  id: string;
  date: string;
  direction: "in" | "out";
  amount: number;
  category: string;
  label: string;
  note: string | null;
  source: "auto" | "manual";
  order_id: string | null;
  balance_after: number;
};
type Summary = {
  income: number;
  expenses: number;
  revenue: number;
  balanceBefore: number;
  balanceAfter: number;
};
// Ligne du tableau : une commande (entrée et frais ensemble) ou une écriture seule.
type Row = {
  id: string;
  date: string;
  order_id: string | null;
  order_number: string | null;
  income: number;
  expense: number;
  entries: Entry[];
  balance_after: number;
};
type MonthData = {
  rows: Row[];
  period: Period;
  date: string;
  start: string;
  end: string;
  month: string;
  entries: Entry[];
  summary: Summary;
  balance: number;
};
type HistoryRow = {
  start: string;
  sales: number;
  expenses: number;
  result: number;
};

const CATEGORY_LABELS: Record<string, string> = {
  sale: "Vente",
  refund: "Remboursement",
  courier_fee: "Frais livreur",
  transport_fee: "Frais compagnie",
  purchase: "Achat de marchandises",
  advertising: "Publicité",
  opening_balance: "Solde initial",
  other_in: "Autre entrée",
  other_out: "Autre dépense",
};
const MANUAL_CATEGORIES = {
  in: ["other_in", "opening_balance"],
  out: ["purchase", "advertising", "other_out"],
} as const;

const inputClass =
  "txt-compact-small w-full rounded-md border border-ui-border-base bg-ui-bg-field px-2 py-1.5 text-ui-fg-base";
const primaryButton =
  "txt-compact-small-plus rounded-md bg-ui-button-inverted px-3 py-1.5 text-ui-fg-on-inverted disabled:opacity-50";
const secondaryButton =
  "txt-compact-small-plus rounded-md border border-ui-border-base bg-ui-bg-base px-3 py-1.5 text-ui-fg-base disabled:opacity-50";
const card = "bg-ui-bg-base shadow-elevation-card-rest rounded-lg";

// Périodes (2026-10-12) : jour, semaine (lundi -> dimanche), mois, année ;
// même découpage que le serveur (lib/cashbook-rules.ts periodRange).
type Period = "day" | "week" | "month" | "year";
const PERIOD_OPTIONS: { value: Period; label: string; of: string; current: string; per: string }[] = [
  { value: "day", label: "Jour", of: "du jour", current: "Aujourd'hui", per: "par jour" },
  { value: "week", label: "Semaine", of: "de la semaine", current: "Semaine en cours", per: "par semaine" },
  { value: "month", label: "Mois", of: "du mois", current: "Mois en cours", per: "par mois" },
  { value: "year", label: "Année", of: "de l'année", current: "Année en cours", per: "par année" },
];
// Libellé d'une ligne du tableau "Chiffre d'affaires par ..." (start = premier jour).
const historyLabel = (period: Period, start: string) => {
  const d = (opts: Intl.DateTimeFormatOptions) => new Date(`${start}T00:00:00Z`).toLocaleDateString("fr-FR", { ...opts, timeZone: "UTC" });
  if (period === "day") return d({ weekday: "short", day: "numeric", month: "short" });
  if (period === "week") return `Semaine du ${d({ day: "numeric", month: "short", year: "numeric" })}`;
  if (period === "year") return start.slice(0, 4);
  return d({ month: "long", year: "numeric" });
};
const today = () => new Date().toISOString().slice(0, 10);
const shiftAnchor = (period: Period, anchor: string, delta: number) => {
  const d = new Date(`${anchor}T00:00:00Z`);
  if (period === "year") d.setUTCFullYear(d.getUTCFullYear() + delta, 0, 1);
  else if (period === "month") d.setUTCMonth(d.getUTCMonth() + delta, 1);
  else d.setUTCDate(d.getUTCDate() + delta * (period === "week" ? 7 : 1));
  return d.toISOString().slice(0, 10);
};
const longDay = (iso: string) =>
  new Date(iso).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const periodLabel = (data: MonthData) => {
  if (data.period === "day") return longDay(data.start);
  if (data.period === "month") return monthLabel(data.month);
  if (data.period === "year") return data.start.slice(0, 4);
  const last = new Date(new Date(data.end).getTime() - 86_400_000).toISOString();
  const short = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });
  return `Semaine du ${short(data.start)} au ${short(last)} ${last.slice(0, 4)}`;
};
const monthLabel = (month: string) =>
  new Date(`${month}-01T00:00:00Z`).toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
  });

type FormState = {
  id: string | null;
  direction: "in" | "out";
  category: string;
  amount: string;
  label: string;
  note: string;
  date: string;
};
const emptyForm = (): FormState => ({
  id: null,
  direction: "out",
  category: "purchase",
  amount: "",
  label: "",
  note: "",
  date: new Date().toISOString().slice(0, 10),
});

const EntryForm = ({
  initial,
  onSaved,
  onCancel,
}: {
  initial: FormState;
  onSaved: () => void;
  onCancel: () => void;
}) => {
  const [form, setForm] = useState<FormState>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<FormState>) =>
    setForm((f) => ({ ...f, ...patch }));

  const save = async () => {
    const amount = Number(form.amount.replace(/\s/g, ""));
    if (!Number.isInteger(amount) || amount <= 0) {
      setError("Montant invalide : nombre entier positif en F CFA.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api(
        form.id ? `/admin/cash-entries/${form.id}` : "/admin/cash-entries",
        {
          method: "POST",
          body: {
            direction: form.direction,
            category: form.category,
            amount,
            label: form.label,
            note: form.note || null,
            date: form.date ? `${form.date}T12:00:00Z` : null,
          },
        },
      );
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`${card} flex flex-col gap-y-2 px-4 py-3`}>
      <span className="txt-compact-small-plus text-ui-fg-base">
        {form.id ? "Modifier l'écriture" : "Nouvelle écriture"}
      </span>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
        <label className="flex flex-col gap-y-1">
          <span className="txt-compact-small text-ui-fg-subtle">Sens</span>
          <select
            className={inputClass}
            value={form.direction}
            onChange={(e) => {
              const direction = e.target.value as "in" | "out";
              set({ direction, category: MANUAL_CATEGORIES[direction][0] });
            }}
          >
            <option value="out">Sortie (dépense)</option>
            <option value="in">Entrée</option>
          </select>
        </label>
        <label className="flex flex-col gap-y-1">
          <span className="txt-compact-small text-ui-fg-subtle">Catégorie</span>
          <select
            className={inputClass}
            value={form.category}
            onChange={(e) => set({ category: e.target.value })}
          >
            {MANUAL_CATEGORIES[form.direction].map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-y-1">
          <span className="txt-compact-small text-ui-fg-subtle">
            Montant (F CFA)
          </span>
          <input
            className={inputClass}
            inputMode="numeric"
            value={form.amount}
            onChange={(e) => set({ amount: e.target.value })}
          />
        </label>
        <label className="flex flex-col gap-y-1 md:col-span-2">
          <span className="txt-compact-small text-ui-fg-subtle">Libellé</span>
          <input
            className={inputClass}
            value={form.label}
            placeholder="Ex. Achat 20 balais-éponges"
            onChange={(e) => set({ label: e.target.value })}
          />
        </label>
        <label className="flex flex-col gap-y-1">
          <span className="txt-compact-small text-ui-fg-subtle">Date</span>
          <input
            type="date"
            className={inputClass}
            value={form.date}
            onChange={(e) => set({ date: e.target.value })}
          />
        </label>
        <label className="flex flex-col gap-y-1 md:col-span-3">
          <span className="txt-compact-small text-ui-fg-subtle">
            Note (facultatif)
          </span>
          <input
            className={inputClass}
            value={form.note}
            onChange={(e) => set({ note: e.target.value })}
          />
        </label>
      </div>
      {error && <p className="txt-compact-small text-ui-fg-error">{error}</p>}
      <div className="flex gap-x-2">
        <button
          type="button"
          className={primaryButton}
          disabled={busy}
          onClick={save}
        >
          {busy ? "Enregistrement…" : "Enregistrer"}
        </button>
        <button
          type="button"
          className={secondaryButton}
          disabled={busy}
          onClick={onCancel}
        >
          Annuler
        </button>
      </div>
    </div>
  );
};

const StatCard = ({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "positive" | "negative";
}) => (
  <div className={`${card} flex flex-col gap-y-1 px-4 py-3`}>
    <span className="txt-compact-small text-ui-fg-subtle">{label}</span>
    <span
      className={`txt-xlarge-plus ${tone === "negative" ? "text-ui-fg-error" : tone === "positive" ? "text-ui-tag-green-text" : "text-ui-fg-base"}`}
    >
      {value}
    </span>
  </div>
);

const CashPage = () => {
  const [period, setPeriod] = useState<Period>("month");
  const [anchor, setAnchor] = useState(today());
  const [data, setData] = useState<MonthData | null>(null);
  const [history, setHistory] = useState<HistoryRow[] | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api<MonthData>(`/admin/cash-entries?period=${period}&date=${anchor}`)
      .then((r) => {
        setData(r);
        setError(null);
      })
      .catch((e) => setError((e as Error).message));
    api<{ rows: HistoryRow[] }>(`/admin/cash-entries/history?period=${period}`)
      .then((r) => setHistory(r.rows))
      .catch(() => setHistory([]));
  }, [period, anchor]);
  useEffect(load, [load]);

  const remove = async (entry: Entry) => {
    try {
      await api(`/admin/cash-entries/${entry.id}`, { method: "DELETE" });
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const s = data?.summary;
  const option = PERIOD_OPTIONS.find((o) => o.value === period)!;
  // Période affichée = celle qui contient aujourd'hui.
  const isCurrent = !!data && today() >= data.start.slice(0, 10) && today() < data.end.slice(0, 10);

  return (
    <div className="flex flex-col gap-y-4">
      <div
        className={`${card} flex flex-wrap items-center justify-between gap-2 px-4 py-3`}
      >
        <div>
          <h1 className="txt-large-plus text-ui-fg-base">Caisse</h1>
          <p className="txt-compact-small text-ui-fg-subtle">
            Ventes et frais de livraison inscrits automatiquement ; achats,
            publicité et divers à saisir.
          </p>
        </div>
        {!form && (
          <button
            type="button"
            className={primaryButton}
            onClick={() => setForm(emptyForm())}
          >
            Nouvelle écriture
          </button>
        )}
      </div>

      {form && (
        <EntryForm
          initial={form}
          onCancel={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            load();
          }}
        />
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-md border border-ui-border-base bg-ui-bg-base p-0.5">
          {PERIOD_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              className={`txt-compact-small-plus rounded px-3 py-1 ${
                period === o.value ? "bg-ui-button-inverted text-ui-fg-on-inverted" : "text-ui-fg-base"
              }`}
              onClick={() => setPeriod(o.value)}
            >
              {o.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className={secondaryButton}
          onClick={() => setAnchor(shiftAnchor(period, anchor, -1))}
          aria-label="Période précédente"
        >
          ‹
        </button>
        <span className="txt-compact-small-plus min-w-[140px] text-center text-ui-fg-base first-letter:uppercase">
          {data ? periodLabel(data) : "…"}
        </span>
        <button
          type="button"
          className={secondaryButton}
          onClick={() => setAnchor(shiftAnchor(period, anchor, 1))}
          aria-label="Période suivante"
        >
          ›
        </button>
        {data && !isCurrent && (
          <button
            type="button"
            className="txt-compact-small text-ui-fg-interactive"
            onClick={() => setAnchor(today())}
          >
            {option.current}
          </button>
        )}
      </div>

      {error && <p className="txt-compact-small text-ui-fg-error">{error}</p>}

      {!data ? (
        <p className="txt-compact-small text-ui-fg-subtle">Chargement…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label="Solde actuel"
              value={formatXof(data.balance)}
              tone={data.balance < 0 ? "negative" : undefined}
            />
            <StatCard
              label={`Chiffre d'affaires ${option.of}`}
              value={formatXof(s!.revenue)}
              tone="positive"
            />
            <StatCard label={`Entrées ${option.of}`} value={formatXof(s!.income)} />
            <StatCard label={`Sorties ${option.of}`} value={formatXof(s!.expenses)} />
          </div>

          <div className={`${card} flex flex-col`}>
            <div className="flex items-center justify-between border-b border-ui-border-base px-4 py-3">
              <span className="txt-compact-small-plus text-ui-fg-base">
                Écritures {option.of}
              </span>
              <span className="txt-compact-small text-ui-fg-subtle">
                Solde en début de période : {formatXof(s!.balanceBefore)} · fin :{" "}
                {formatXof(s!.balanceAfter)}
              </span>
            </div>
            {data.rows.length > 0 && (
              // En-tête des colonnes de montants (2026-10-12) : Entrée, Sortie, Solde.
              <div className="txt-compact-xsmall-plus hidden items-center gap-x-3 border-b border-ui-border-base px-4 py-2 text-ui-fg-subtle sm:flex">
                <span className="w-12 shrink-0">Date</span>
                <span className="min-w-0 flex-1">Libellé</span>
                <span className="w-24 shrink-0 text-right">Entrée</span>
                <span className="w-24 shrink-0 text-right">Sortie</span>
                <span className="w-24 shrink-0 text-right">Solde</span>
                <span className="w-32 shrink-0" />
              </div>
            )}
            {data.rows.length === 0 ? (
              <p className="txt-compact-small px-4 py-3 text-ui-fg-subtle">
                Aucune écriture sur cette période.
              </p>
            ) : (
              data.rows.map((row) => {
                // Écriture seule (sans commande) : libellé, catégorie et actions comme avant.
                const single = !row.order_id ? row.entries[0] : null;
                return (
                  <div
                    key={row.id}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-ui-border-base px-4 py-2 last:border-b-0"
                  >
                    <span className="txt-compact-small w-12 shrink-0 text-ui-fg-subtle">
                      {formatDate(row.date)}
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col break-words">
                      <span className="txt-compact-small text-ui-fg-base">
                        {row.order_id ? (
                          <a href={`/app/orders/${row.order_id}`} className="text-ui-fg-interactive">
                            Commande {row.order_number ?? ""}
                          </a>
                        ) : (
                          single!.label
                        )}
                      </span>
                      <span className="txt-compact-xsmall text-ui-fg-subtle">
                        {single
                          ? `${CATEGORY_LABELS[single.category] ?? single.category}${single.source === "auto" ? " · automatique" : ""}${single.note ? ` · ${single.note}` : ""}`
                          : [...row.entries]
                              .sort((a, b) => (a.direction === b.direction ? 0 : a.direction === "in" ? -1 : 1))
                              .map((e) => `${CATEGORY_LABELS[e.category] ?? e.category} ${formatXof(e.amount)}`)
                              .join(" · ")}
                      </span>
                    </div>
                    <span className="txt-compact-small-plus w-24 shrink-0 text-right tabular-nums text-ui-tag-green-text">
                      {row.income ? formatXof(row.income) : ""}
                    </span>
                    <span className="txt-compact-small-plus w-24 shrink-0 text-right tabular-nums text-ui-fg-error">
                      {row.expense ? formatXof(row.expense) : ""}
                    </span>
                    <span className="txt-compact-small w-24 shrink-0 text-right tabular-nums text-ui-fg-base">
                      {formatXof(row.balance_after)}
                    </span>
                    {/* Colonne d'actions de largeur fixe : montants alignés sur toutes les lignes. */}
                    <div
                      className={`${single?.source === "manual" ? "flex" : "hidden sm:flex"} w-full shrink-0 justify-end gap-x-2 sm:w-32`}
                    >
                      {single?.source === "manual" && (
                        <>
                          <button
                            type="button"
                            className="txt-compact-xsmall text-ui-fg-interactive"
                            onClick={() =>
                              setForm({
                                id: single.id,
                                direction: single.direction,
                                category: single.category,
                                amount: String(single.amount),
                                label: single.label,
                                note: single.note ?? "",
                                date: single.date.slice(0, 10),
                              })
                            }
                          >
                            Modifier
                          </button>
                          <button
                            type="button"
                            className="txt-compact-xsmall text-ui-fg-error"
                            onClick={() => void remove(single)}
                          >
                            Supprimer
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </>
      )}

      {history && history.length > 0 && (
        <div className={`${card} flex flex-col`}>
          <span className="txt-compact-small-plus border-b border-ui-border-base px-4 py-3 text-ui-fg-base">
            Chiffre d'affaires {option.per}
          </span>
          <div className="txt-compact-xsmall grid grid-cols-4 gap-2 border-b border-ui-border-base px-4 py-2 text-ui-fg-subtle">
            <span>{option.label}</span>
            <span className="text-right">Ventes</span>
            <span className="text-right">Dépenses</span>
            <span className="text-right">Résultat</span>
          </div>
          {history.map((row) => (
            <button
              key={row.start}
              type="button"
              onClick={() => setAnchor(row.start)}
              className="txt-compact-small grid grid-cols-4 gap-2 border-b border-ui-border-base px-4 py-2 text-left last:border-b-0 hover:bg-ui-bg-subtle"
            >
              <span className="text-ui-fg-base first-letter:uppercase">
                {historyLabel(period, row.start)}
              </span>
              <span className="text-right tabular-nums text-ui-fg-base">
                {formatXof(row.sales)}
              </span>
              <span className="text-right tabular-nums text-ui-fg-base">
                {formatXof(row.expenses)}
              </span>
              <span
                className={`text-right tabular-nums ${row.result < 0 ? "text-ui-fg-error" : "text-ui-tag-green-text"}`}
              >
                {formatXof(row.result)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export const config = defineRouteConfig({
  label: "Caisse",
  icon: Cash,
});

export default CashPage;
