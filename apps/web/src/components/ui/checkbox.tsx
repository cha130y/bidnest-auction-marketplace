"use client"

import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox"

import { cn } from "@/lib/utils"
import { CheckIcon } from "lucide-react"

function Checkbox({ className, ...props }: CheckboxPrimitive.Root.Props) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer flex size-6 shrink-0 items-center justify-center rounded-r1 border-2 border-n-300 bg-white outline-none transition-colors focus-visible:ring-3 focus-visible:ring-amber-500/30 disabled:cursor-not-allowed disabled:opacity-50 data-checked:border-amber-500 data-checked:bg-amber-500",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-white transition-none [&>svg]:size-4"
      >
        <CheckIcon strokeWidth={3} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
