import { Listbox, Transition } from "@headlessui/react"
import { ChevronUpDown } from "@medusajs/icons"
import { clx } from "@modules/common/components/ui"
import { Fragment, useMemo } from "react"

import compareAddresses from "@lib/util/compare-addresses"
import { HttpTypes } from "@medusajs/types"
import Radio from "@modules/common/components/radio"

type AddressSelectProps = {
  addresses: HttpTypes.StoreCustomerAddress[]
  addressInput: HttpTypes.StoreCartAddress | null
  onSelect: (address: HttpTypes.StoreCartAddress | undefined, email?: string) => void
}

const AddressSelect = ({ addresses, addressInput, onSelect }: AddressSelectProps) => {
  const handleSelect = (id: string) => {
    const savedAddress = addresses.find((a) => a.id === id)
    if (savedAddress) {
      onSelect(savedAddress as HttpTypes.StoreCartAddress)
    }
  }

  const selectedAddress = useMemo(() => {
    return addresses.find((a) => addressInput && compareAddresses(a, addressInput))
  }, [addresses, addressInput])

  return (
    <Listbox onChange={handleSelect} value={selectedAddress?.id}>
      <div className="relative">
        <Listbox.Button
          className="relative w-full flex justify-between items-center px-4 py-2.5 text-left bg-white cursor-pointer border border-gm-border rounded-lg focus:outline-none focus:border-gm-gold text-sm text-gm-ink"
          data-testid="shipping-address-select"
        >
          {({ open }) => (
            <>
              <span className="block truncate">
                {selectedAddress ? selectedAddress.address_1 : "Choisir une adresse"}
              </span>
              <ChevronUpDown
                className={clx("transition-transform duration-200", { "transform rotate-180": open })}
              />
            </>
          )}
        </Listbox.Button>
        <Transition
          as={Fragment}
          leave="transition ease-in duration-100"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <Listbox.Options
            className="absolute z-20 w-full overflow-auto text-sm bg-white border border-gm-border rounded-lg mt-1 max-h-60 focus:outline-none shadow-md"
            data-testid="shipping-address-options"
          >
            {addresses.map((address) => {
              return (
                <Listbox.Option
                  key={address.id}
                  value={address.id}
                  className="cursor-pointer select-none relative pl-4 pr-4 hover:bg-gm-ivoire-2 py-3"
                  data-testid="shipping-address-option"
                >
                  <div className="flex gap-x-3 items-start">
                    <Radio checked={selectedAddress?.id === address.id} data-testid="shipping-address-radio" />
                    <div className="flex flex-col">
                      <span className="text-sm font-semibold text-gm-ink">
                        {address.first_name} {address.last_name}
                      </span>
                      {address.company && (
                        <span className="text-xs text-gm-ink-muted">{address.company}</span>
                      )}
                      <div className="flex flex-col text-xs text-gm-ink-muted mt-1">
                        <span>
                          {address.address_1}
                          {address.address_2 && <span>, {address.address_2}</span>}
                        </span>
                        <span>
                          {address.postal_code}, {address.city}
                        </span>
                        <span>
                          {address.province && `${address.province}, `}
                          {address.country_code?.toUpperCase()}
                        </span>
                      </div>
                    </div>
                  </div>
                </Listbox.Option>
              )
            })}
          </Listbox.Options>
        </Transition>
      </div>
    </Listbox>
  )
}

export default AddressSelect
