"use client"

import type { ReactNode } from "react"

import { Label } from "@/components/ui/label"

/**
 * One labelled field, wired for screen readers.
 *
 * The account forms already showed a visible label and put the error beside
 * the field it belongs to. What they did not do is connect the three: the
 * error was a paragraph that happened to sit underneath, so a screen reader
 * read the box as valid and never announced why the form refused. This ties
 * them together — `aria-invalid` on the control, `aria-describedby` pointing
 * at whichever of hint or error is showing, and `role="alert"` so an error
 * that appears after submit is spoken rather than silently drawn.
 *
 * Hint and error share one slot deliberately. Two stacked lines of small
 * grey-and-red text under every box is how a form starts looking anxious,
 * and once there is something wrong the hint has already been read.
 */
export function Field({
  id,
  label,
  error,
  hint,
  optional,
  children
}: {
  id: string
  label: string
  error?: string
  /** Shown until an error replaces it. */
  hint?: string
  /** Drops the required marker and says so in the label instead. */
  optional?: boolean
  /** Called with the props the control must spread, so the wiring cannot be forgotten. */
  children: (props: {
    id: string
    required: boolean
    "aria-invalid": boolean
    "aria-describedby": string | undefined
  }) => ReactNode
}) {
  const messageId = error ? `${id}-error` : hint ? `${id}-hint` : undefined

  return (
    <div className="space-y-2">
      <Label
        htmlFor={id}
        className="text-sm font-semibold text-ink has-[+_*_:disabled]:opacity-50"
      >
        {label}
        {optional ? (
          <span className="-ml-1 font-normal text-n-600">(ไม่บังคับ)</span>
        ) : (
          // `required-indicators`: say which boxes are compulsory before the
          // form is submitted, not after. Hidden from screen readers because
          // `required` on the control already announces it — read aloud, a
          // bare asterisk is just "star".
          // -ml-1 because Label is already `flex gap-2`; without it the
          // marker sits 12px out and reads as its own word.
          <span aria-hidden className="-ml-1 text-base leading-none text-red">
            *
          </span>
        )}
      </Label>

      {children({
        id,
        required: !optional,
        "aria-invalid": Boolean(error),
        "aria-describedby": messageId
      })}

      {error ? (
        <p
          id={messageId}
          role="alert"
          className="flex items-start gap-1.5 text-sm font-medium text-red"
        >
          {/* Not colour alone: a red line reads as ordinary text to anyone who
              cannot separate it from the hint that was there a moment ago. */}
          <span aria-hidden className="mt-px leading-none">
            ⚠
          </span>
          {error}
        </p>
      ) : (
        hint && (
          // n-600, not n-500: measured against white, n-500 lands at 3.24:1,
          // under the 4.5:1 normal text needs, and a hint nobody can read is
          // just noise under the box. n-600 measures 6.93:1.
          <p id={messageId} className="text-xs leading-relaxed text-n-600">
            {hint}
          </p>
        )
      )}
    </div>
  )
}

/**
 * The form-level failure — a wrong password, an address already taken, an API
 * that could not be reached. Separate from `Field` because it belongs to the
 * submit rather than to any one box, and it has to be announced the moment it
 * replaces the button's spinner.
 */
export function FormError({ children }: { children: ReactNode }) {
  if (!children) return null

  return (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-r2 bg-red/8 px-4 py-3 text-sm font-medium text-red"
    >
      <span aria-hidden className="mt-px leading-none">
        ⚠
      </span>
      {children}
    </p>
  )
}
