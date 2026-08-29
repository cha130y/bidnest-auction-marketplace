"use client"

import { Switch as SwitchPrimitive } from "@base-ui/react/switch"

import { cn } from "@/lib/utils"

function Switch({ className, ...props }: SwitchPrimitive.Root.Props) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "peer group/switch relative inline-flex h-7.5 w-13 shrink-0 items-center rounded-full bg-n-300 outline-none transition-colors focus-visible:ring-3 focus-visible:ring-amber-500/30 disabled:cursor-not-allowed disabled:opacity-50 data-checked:bg-amber-500",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block size-6 translate-x-0.75 rounded-full bg-white shadow-sh1 transition-transform group-data-checked/switch:translate-x-6.25"
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
