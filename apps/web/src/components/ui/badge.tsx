import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex h-[26px] w-fit shrink-0 items-center gap-1.5 rounded-full px-3 font-body text-xs font-semibold whitespace-nowrap [&_svg]:size-3.5 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        live: "bg-red-50 text-red",
        ending: "bg-amber-100 text-amber-600",
        new: "bg-amber-50 text-amber-600",
        sale: "bg-red-50 text-red",
        won: "bg-green-50 text-green",
        sold: "bg-n-100 text-n-500",
        verified: "border border-n-300 bg-white text-n-600",
      },
    },
    defaultVariants: {
      variant: "new",
    },
  }
)

function Badge({
  className,
  variant,
  dot,
  render,
  children,
  ...props
}: Omit<useRender.ComponentProps<"span">, "children"> &
  VariantProps<typeof badgeVariants> & {
    dot?: boolean
    children?: React.ReactNode
  }) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant }), className),
        children: (
          <>
            {dot && (
              <span className="size-1.75 shrink-0 rounded-full bg-current motion-safe:animate-pulse" />
            )}
            {children}
          </>
        ),
      },
      props
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  })
}

export { Badge, badgeVariants }
