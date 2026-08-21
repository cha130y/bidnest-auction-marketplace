import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-r2 font-body font-semibold whitespace-nowrap transition-all outline-none select-none disabled:pointer-events-none disabled:opacity-45 disabled:shadow-none focus-visible:ring-3 focus-visible:ring-amber-500/30 active:not-disabled:translate-y-0 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-[1.1em]",
  {
    variants: {
      variant: {
        primary:
          "bg-linear-to-b from-amber-400 to-amber-500 text-ink shadow-amber hover:-translate-y-px hover:from-[#fdc468] hover:to-amber-400",
        dark: "bg-linear-to-b from-[#2b303b] to-ink text-white shadow-sh1 hover:-translate-y-px hover:from-[#363c49] hover:to-n-700",
        secondary:
          "border border-n-300 bg-white text-ink hover:border-amber-500 hover:text-amber-600",
        ghost: "bg-transparent text-n-600 hover:bg-n-100 hover:text-ink",
        danger: "border border-red bg-white text-red hover:bg-red-50",
      },
      size: {
        sm: "h-9 px-4 text-sm",
        md: "h-12 px-6 text-base",
        lg: "h-14 px-8 text-lg",
        icon: "size-11 p-0",
      },
      pill: {
        true: "rounded-full",
      },
      block: {
        true: "w-full",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
)

function Button({
  className,
  variant,
  size,
  pill,
  block,
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      className={cn(buttonVariants({ variant, size, pill, block, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
