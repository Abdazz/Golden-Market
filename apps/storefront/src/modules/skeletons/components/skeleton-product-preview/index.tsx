const SkeletonProductPreview = () => {
  return (
    <div className="animate-pulse rounded-2xl border border-gm-border bg-white overflow-hidden">
      <div className="aspect-square w-full bg-gm-ivoire-2" />
      <div className="flex flex-col gap-2 p-3">
        <div className="w-4/5 h-4 bg-gm-ivoire-2 rounded"></div>
        <div className="w-1/3 h-4 bg-gm-ivoire-2 rounded"></div>
      </div>
    </div>
  )
}

export default SkeletonProductPreview
