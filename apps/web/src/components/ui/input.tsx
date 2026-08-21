import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

type InputProps = React.ComponentProps<typeof InputPrimitive> & {
  pill?: boolean
  invalid?: boolean
  startIcon?: React.ReactNode
  endSlot?: React.ReactNode
  wrapperClassName?: string
}

function Input({
  className,
  wrapperClassName,
  pill,
  invalid,
  startIcon,
  endSlot,
  type,
  disabled,
  ...props
}: InputProps) {
  return (
    <div
      data-slot="input-wrapper"
      data-disabled={disabled}
      className={cn(
        "flex h-14 w-full items-center gap-3 rounded-r3 border-[1.5px] border-transparent bg-n-100 px-5 shadow-well transition-colors has-focus:border-amber-500 has-focus:bg-white has-focus:shadow-focus data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50",
        pill && "rounded-full",
        invalid && "border-red bg-red-50 has-focus:border-red has-focus:shadow-none",
        wrapperClassName
      )}
    >
      {startIcon && (
        <span className="flex shrink-0 text-n-500 [&_svg]:size-5">
          {startIcon}
        </span>
      )}
      <InputPrimitive
        type={type}
        data-slot="input"
        disabled={disabled}
        className={cn(
          "w-full min-w-0 flex-1 bg-transparent font-body text-base text-ink outline-none placeholder:text-n-500",
          invalid && "placeholder:text-red",
          className
        )}
        {...props}
      />
      {endSlot}
    </div>
  )
}

export { Input }
