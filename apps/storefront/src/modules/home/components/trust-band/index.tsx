const items = [
  {
    title: "Paiement Orange Money",
    detail: "Simple et sécurisé, sans carte bancaire",
  },
  {
    title: "Livraison au Burkina Faso",
    detail: "Expédié depuis Ouagadougou",
  },
  {
    title: "Une question ?",
    detail: "+226 61 85 37 37 sur WhatsApp",
  },
]

const TrustBand = () => {
  return (
    <div className="w-full bg-gm-ivoire-2 border-b border-gm-border">
      <div className="content-container grid grid-cols-1 small:grid-cols-3 gap-5 py-6">
        {items.map((item) => (
          <div key={item.title} className="flex flex-col">
            <strong className="text-sm font-semibold text-gm-ink">
              {item.title}
            </strong>
            <span className="text-sm text-gm-ink-muted">{item.detail}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default TrustBand
