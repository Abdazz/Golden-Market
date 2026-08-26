import { Table } from "@modules/common/components/ui"

type SkeletonLineItemProps = {
  /**
   * "table" renders a Table.Row/Table.Cell skeleton for consumers that still
   * wrap items in a <Table> (e.g. order confirmation).
   * "card" renders a flexbox card skeleton matching the restyled cart Item
   * component, for consumers that no longer use a <Table> wrapper.
   */
  variant?: "table" | "card"
}

const SkeletonLineItem = ({ variant = "table" }: SkeletonLineItemProps) => {
  if (variant === "card") {
    return (
      <div className="flex gap-4 py-4 border-b border-gm-border last:border-0">
        <div className="shrink-0 w-20 small:w-24">
          <div className="w-full aspect-square bg-gray-200 animate-pulse" />
        </div>
        <div className="flex flex-1 flex-col min-w-0 gap-2">
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-2 min-w-0">
              <div className="w-32 h-4 bg-gray-200 animate-pulse" />
              <div className="w-24 h-4 bg-gray-200 animate-pulse" />
            </div>
            <div className="w-12 h-6 bg-gray-200 animate-pulse" />
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="w-16 h-10 bg-gray-200 animate-pulse" />
            </div>
            <div className="w-12 h-6 bg-gray-200 animate-pulse" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <Table.Row className="w-full m-4">
      <Table.Cell className="p-4 w-24">
        <div className="flex w-24 h-24 p-4 bg-gray-200 animate-pulse" />
      </Table.Cell>
      <Table.Cell className="text-left">
        <div className="flex flex-col gap-y-2">
          <div className="w-32 h-4 bg-gray-200 animate-pulse" />
          <div className="w-24 h-4 bg-gray-200 animate-pulse" />
        </div>
      </Table.Cell>
      <Table.Cell>
        <div className="flex gap-2 items-center">
          <div className="w-6 h-8 bg-gray-200 animate-pulse" />
          <div className="w-14 h-10 bg-gray-200 animate-pulse" />
        </div>
      </Table.Cell>
      <Table.Cell>
        <div className="flex gap-2">
          <div className="w-12 h-6 bg-gray-200 animate-pulse" />
        </div>
      </Table.Cell>
      <Table.Cell>
        <div className="flex gap-2 justify-end">
          <div className="w-12 h-6 bg-gray-200 animate-pulse" />
        </div>
      </Table.Cell>
    </Table.Row>
  )
}

export default SkeletonLineItem
