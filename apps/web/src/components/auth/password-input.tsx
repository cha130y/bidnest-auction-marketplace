"use client"

import * as React from "react"
import { Eye, EyeOff } from "lucide-react"

import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

/**
 * A password box with a show/hide toggle.
 *
 * Typing a password you cannot see is where most sign-up mistakes come from,
 * and on a phone it is most of them. Being able to look is the fix; being able
 * to look *by default* is not, so it starts hidden and the person asks.
 *
 * The button is `tabIndex={-1}`: tabbing from the password field should reach
 * the next field or the submit, not a control that only changes how the text
 * looks. It stays reachable by pointer and by screen reader, which is who it
 * is for.
 *
 * `aria-pressed` rather than a changing label, so a screen reader announces
 * the state instead of only the action.
 */
type PasswordInputProps = Omit<React.ComponentProps<typeof Input>, "type"> & {
  /** Same values a plain password input takes. */
  autoComplete?: "current-password" | "new-password"
}

export const PasswordInput = React.forwardRef<
  HTMLInputElement,
  PasswordInputProps
>(function PasswordInput(
  { autoComplete = "current-password", className, ...props },
  ref
) {
  const [visible, setVisible] = React.useState(false)

  return (
    <Input
      {...props}
      ref={ref}
      type={visible ? "text" : "password"}
      autoComplete={autoComplete}
      // Edge draws its own reveal control inside every password box, so the
      // register form showed two eyes side by side — ours and the browser's.
      // Hiding theirs rather than ours: theirs sits outside the design, has
      // no Thai label, is not `aria-pressed`, and disappears the moment the
      // field is empty. Chromium and Firefox do not recognise these
      // pseudo-elements and drop the rules, which is exactly right — there
      // is nothing to hide there.
      className={cn(
        "[&::-ms-reveal]:hidden [&::-ms-clear]:hidden",
        className
      )}
      endSlot={
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setVisible((shown) => !shown)}
          aria-pressed={visible}
          aria-label={visible ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
          title={visible ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
          // A 44px square around a 20px icon. The icon alone measured
          // 20×20 — half the minimum a finger can reliably hit, and this is
          // the one control on the screen someone reaches for while already
          // mistyping. `-mr-3` pulls the extra width back out of the layout
          // so the box does not grow to fit the new hit area.
          className="-mr-3 flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-r2 text-n-600 transition-colors hover:text-ink focus-visible:ring-3 focus-visible:ring-amber-500/30 focus-visible:outline-none [&_svg]:size-5"
        >
          {visible ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
        </button>
      }
    />
  )
})
