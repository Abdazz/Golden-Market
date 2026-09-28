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
type MonthData = {
  month: string;
  entries: Entry[];
  summary: Summary;
  balance: number;
};
type HistoryRow = {
  month: string;
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

const currentMonth = () => new Date().toISOString().slice(0, 7);
const monthLabel = (month: string) =>
  new Date(`${month}-01T00:00:00Z`).toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
const shiftMonth = (month: string, delta: number) => {
  const d = new Date(`${month}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + delta);
  return d.toISOString().slice(0, 7);
};
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
  const [month, setMonth] = useState(currentMonth());
  const [data, setData] = useState<MonthData | null>(null);
  const [history, setHistory] = useState<HistoryRow[] | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api<MonthData>(`/admin/cash-entries?month=${month}`)
      .then((r) => {
        setData(r);
        setError(null);
      })
      .catch((e) => setError((e as Error).message));
    api<{ months: HistoryRow[] }>("/admin/cash-entries/history")
      .then((r) => setHistory(r.months))
      .catch(() => setHistory([]));
  }, [month]);
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

      <div className="flex items-center gap-x-2">
        <button
          type="button"
          className={secondaryButton}
          onClick={() => setMonth(shiftMonth(month, -1))}
          aria-label="Mois précédent"
        >
          ‹
        </button>
        <span className="txt-compact-small-plus min-w-[140px] text-center capitalize text-ui-fg-base">
          {monthLabel(month)}
        </span>
        <button
          type="button"
          className={secondaryButton}
          onClick={() => setMonth(shiftMonth(month, 1))}
          aria-label="Mois suivant"
        >
          ›
        </button>
        {month !== currentMonth() && (
          <button
            type="button"
            className="txt-compact-small text-ui-fg-interactive"
            onClick={() => setMonth(currentMonth())}
          >
            Mois en cours
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
              label="Chiffre d'affaires du mois"
              value={formatXof(s!.revenue)}
              tone="positive"
            />
            <StatCard label="Entrées du mois" value={formatXof(s!.income)} />
            <StatCard label="Sorties du mois" value={formatXof(s!.expenses)} />
          </div>

          <div className={`${card} flex flex-col`}>
            <div className="flex items-center justify-between border-b border-ui-border-base px-4 py-3">
              <span className="txt-compact-small-plus text-ui-fg-base">
                Écritures du mois
              </span>
              <span className="txt-compact-small text-ui-fg-subtle">
                Solde en début de mois : {formatXof(s!.balanceBefore)} · fin :{" "}
                {formatXof(s!.balanceAfter)}
              </span>
            </div>
            {data.entries.length === 0 ? (
              <p className="txt-compact-small px-4 py-3 text-ui-fg-subtle">
                Aucune écriture ce mois-ci.
              </p>
            ) : (
              data.entries.map((entry) => (
                <div
                  key={entry.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-ui-border-base px-4 py-2 last:border-b-0"
                >
                  <span className="txt-compact-small w-12 shrink-0 text-ui-fg-subtle">
                    {formatDate(entry.date)}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col break-words">
                    <span className="txt-compact-small text-ui-fg-base">
                      {entry.order_id ? (
                        <a
                          href={`/app/orders/${entry.order_id}`}
                          className="text-ui-fg-interactive"
                        >
                          {entry.label}
                        </a>
                      ) : (
                        entry.label
                      )}
                    </span>
                    <span className="txt-compact-xsmall text-ui-fg-subtle">
                      {CATEGORY_LABELS[entry.category] ?? entry.category}
                      {entry.source === "auto" ? " · automatique" : ""}
                      {entry.note ? ` · ${entry.note}` : ""}
                    </span>
                  </div>
                  <span
                    className={`txt-compact-small-plus shrink-0 tabular-nums ${entry.direction === "in" ? "text-ui-tag-green-text" : "text-ui-fg-error"}`}
                  >
                    {entry.direction === "in" ? "+" : "−"}
                    {formatXof(entry.amount)}
                  </span>
                  <span className="txt-compact-xsmall hidden w-24 shrink-0 text-right tabular-nums text-ui-fg-subtle sm:block">
                    {formatXof(entry.balance_after)}
                  </span>
                  {/* Colonne d'actions de largeur fixe : montants alignés sur toutes les lignes. */}
                  <div
                    className={`${entry.source === "manual" ? "flex" : "hidden sm:flex"} w-full shrink-0 justify-end gap-x-2 sm:w-32`}
                  >
                    {entry.source === "manual" && (
                      <>
                        <button
                          type="button"
                          className="txt-compact-xsmall text-ui-fg-interactive"
                          onClick={() =>
                            setForm({
                              id: entry.id,
                              direction: entry.direction,
                              category: entry.category,
                              amount: String(entry.amount),
                              label: entry.label,
                              note: entry.note ?? "",
                              date: entry.date.slice(0, 10),
                            })
                          }
                        >
                          Modifier
                        </button>
                        <button
                          type="button"
                          className="txt-compact-xsmall text-ui-fg-error"
                          onClick={() => void remove(entry)}
                        >
                          Supprimer
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}

      {history && history.length > 0 && (
        <div className={`${card} flex flex-col`}>
          <span className="txt-compact-small-plus border-b border-ui-border-base px-4 py-3 text-ui-fg-base">
            Chiffre d'affaires par mois
          </span>
          <div className="txt-compact-xsmall grid grid-cols-4 gap-2 border-b border-ui-border-base px-4 py-2 text-ui-fg-subtle">
            <span>Mois</span>
            <span className="text-right">Ventes</span>
            <span className="text-right">Dépenses</span>
            <span className="text-right">Résultat</span>
          </div>
          {history.map((row) => (
            <button
              key={row.month}
              type="button"
              onClick={() => setMonth(row.month)}
              className="txt-compact-small grid grid-cols-4 gap-2 border-b border-ui-border-base px-4 py-2 text-left last:border-b-0 hover:bg-ui-bg-subtle"
            >
              <span className="capitalize text-ui-fg-base">
                {monthLabel(row.month)}
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
