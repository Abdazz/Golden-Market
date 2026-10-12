// Retouches de la liste des commandes de l'admin Medusa (2026-10-11, demandées
// par le propriétaire), impossibles par les extensions officielles (la liste
// native n'accepte ni nouvelle colonne ni autre format de date) : on modifie le
// code compilé de @medusajs/dashboard avant chaque build (npm run build / dev).
// - colonne "Livreur" après "Livraison" : order.courier_name, ajouté à la
//   réponse de GET /admin/orders par src/lib/order-list-delivery.ts ;
// - colonne "Date" : date et heure (le reste de l'admin garde la date seule) ;
// - bouton "Mark as paid" de la fiche commande : ouvre le formulaire de
//   src/admin/widgets/order-mark-paid.tsx (montant encaissé et frais) au lieu
//   de la confirmation native ;
// - page d'arrivée de l'admin (après connexion, ou /app) : le Tableau de bord
//   (src/admin/routes/dashboard) au lieu de la liste des commandes ;
// - menu latéral : "Tableau de bord" en premier, au-dessus de "Orders", puis
//   "Livraisons" et "Caisse" juste sous "Orders" (2026-10-12) ; les menus des
//   extensions sont sinon toujours placés après les menus natifs.
//
// Idempotent. Si Medusa change ce code (mise à jour du dashboard), le script
// échoue et le build s'arrête : adapter les ancres ci-dessous à la nouvelle version.
import { createRequire } from "node:module"
import { readdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

const PATCHES = [
  {
    name: "colonne Livreur",
    marker: "/* golden-market:courier-column */",
    anchor: `      columnHelper.accessor("sales_channel", {
        header: () => /* @__PURE__ */ jsx6(SalesChannelHeader, {}),
        cell: ({ getValue }) => {
          const channel = getValue();
          return /* @__PURE__ */ jsx6(SalesChannelCell, { channel });
        }
      }),
`,
    apply: (anchor, marker) => `${anchor}      ${marker}
      columnHelper.display({
        id: "courier_name",
        header: () => /* @__PURE__ */ jsx6("div", { className: "flex h-full w-full items-center", children: /* @__PURE__ */ jsx6("span", { className: "truncate", children: "Livreur" }) }),
        cell: ({ row }) => row.original.courier_name ? /* @__PURE__ */ jsx6("div", { className: "flex h-full w-full items-center overflow-hidden", children: /* @__PURE__ */ jsx6("span", { className: "truncate", children: row.original.courier_name }) }) : /* @__PURE__ */ jsx6("span", { className: "text-ui-fg-muted", children: "-" })
      }),
`,
  },
  {
    name: "heure dans la colonne Date",
    marker: "/* golden-market:order-date-time */",
    anchor: `          const date = new Date(getValue());
          return /* @__PURE__ */ jsx6(DateCell, { date });`,
    apply: (_anchor, marker) => `          ${marker}
          const date = new Date(getValue());
          return /* @__PURE__ */ jsx6("div", { className: "flex h-full w-full items-center overflow-hidden", children: /* @__PURE__ */ jsx6("span", { className: "truncate", children: date.toLocaleString("fr-FR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) }) });`,
  },
  {
    name: "formulaire Marquer comme payée",
    marker: "/* golden-market:mark-as-paid-form */",
    anchor: `          onClick: () => handleMarkAsPaid(unpaidPaymentCollection),`,
    apply: (_anchor, marker) =>
      `          ${marker}
          onClick: () => window.dispatchEvent(new CustomEvent("golden-market:mark-as-paid", { detail: { order_id: order.id } })),`,
  },
  {
    name: "connexion vers le Tableau de bord",
    marker: "/* golden-market:login-to-dashboard */",
    anchor: `  const from = location.state?.from?.pathname || "/orders";`,
    apply: (_anchor, marker) => `  ${marker}
  const from = location.state?.from?.pathname || "/dashboard";`,
  },
  {
    name: "accueil vers le Tableau de bord",
    marker: "/* golden-market:home-to-dashboard */",
    anchor: `    navigate("/orders", { replace: true });`,
    apply: (_anchor, marker) => `    ${marker}
    navigate("/dashboard", { replace: true });`,
  },
  {
    name: "ordre du menu",
    marker: "/* golden-market:pinned-menu */",
    anchor: `  const extensionItems = menuItems.filter((item) => !item.nested);`,
    apply: (_anchor, marker) => `  ${marker}
  const PINNED_FIRST = ["/dashboard"];
  const PINNED_AFTER_ORDERS = ["/deliveries", "/cash"];
  const pinnedItems = (paths) => paths.map((to) => menuItems.find((item) => !item.nested && item.to === to)).filter(Boolean);
  const firstExtensionItems = pinnedItems(PINNED_FIRST);
  const afterOrdersItems = pinnedItems(PINNED_AFTER_ORDERS);
  const extensionItems = menuItems.filter((item) => !item.nested && !PINNED_FIRST.includes(item.to) && !PINNED_AFTER_ORDERS.includes(item.to));
  const extensionEntry = (item) => /* @__PURE__ */ jsx16(LayoutComposer.Entry, { id: \`nav:\${item.to}\`, children: /* @__PURE__ */ jsx16(NavItem, { to: item.to, label: item.label, icon: item.icon ? item.icon : /* @__PURE__ */ jsx16(SquaresPlus, {}), items: item.items, translationNs: item.translationNs, type: "extension" }, item.to) }, item.to);`,
  },
  {
    name: "ordre du menu (affichage)",
    marker: "/* golden-market:pinned-menu-render */",
    anchor: `          coreRoutes.map((route) => /* @__PURE__ */ jsx16(LayoutComposer.Entry, { id: \`nav:\${route.to}\`, children: /* @__PURE__ */ jsx16(NavItem, { ...route }, route.to) }, route.to)),`,
    apply: (_anchor, marker) => `          ${marker}
          firstExtensionItems.map(extensionEntry),
          coreRoutes.flatMap((route) => [
            /* @__PURE__ */ jsx16(LayoutComposer.Entry, { id: \`nav:\${route.to}\`, children: /* @__PURE__ */ jsx16(NavItem, { ...route }, route.to) }, route.to),
            ...(route.to === "/orders" ? afterOrdersItems.map(extensionEntry) : [])
          ]),`,
  },
]

const require = createRequire(import.meta.url)
const dist = join(dirname(require.resolve("@medusajs/dashboard/package.json")), "dist")
const files = readdirSync(dist).filter((f) => f.endsWith(".mjs"))
const failed = []
for (const patch of PATCHES) {
  let done = 0
  for (const file of files) {
    const path = join(dist, file)
    const source = readFileSync(path, "utf8")
    if (source.includes(patch.marker)) {
      done++
      continue
    }
    if (!source.includes(patch.anchor)) continue
    writeFileSync(path, source.replace(patch.anchor, patch.apply(patch.anchor, patch.marker)))
    done++
  }
  if (done) console.log(`patch-dashboard : ${patch.name} en place.`)
  else failed.push(patch.name)
}
if (failed.length) {
  console.error(`patch-dashboard : ${failed.join(", ")} impossible, le code de @medusajs/dashboard a changé (voir scripts/patch-dashboard.mjs).`)
  process.exit(1)
}
