"use client"

import Image from "next/image"
import { useRef, useState } from "react"
import type { SVGProps } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"

import boybrand from "@/app/photos/boybrand.png"
import dreamteam from "@/app/photos/dreamteam.png"
import girlgroup from "@/app/photos/girlgroup.png"
import happyteam from "@/app/photos/happyteam.png"
import work from "@/app/photos/work.png"

function IconTwitter(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M23 5a8 8 0 01-2.3.6A4 4 0 0022.4 3a8 8 0 01-2.5 1A4 4 0 0013 7.5a11 11 0 01-8-4 4 4 0 001.2 5.3A4 4 0 013 8.3a4 4 0 003.2 4 4 4 0 01-1.8.1 4 4 0 003.7 2.8A8 8 0 012 17a11 11 0 006 1.8c7.2 0 11.1-6 11.1-11.1v-.5A8 8 0 0023 5z" />
    </svg>
  )
}

function IconFacebook(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z" />
    </svg>
  )
}

function IconTikTok(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M16 2a5 5 0 005 5v3a8 8 0 01-5-1.7V15a6 6 0 11-6-6v3a3 3 0 103 3V2z" />
    </svg>
  )
}

function IconInstagram(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      {...props}
    >
      <rect x="2" y="2" width="20" height="20" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" />
    </svg>
  )
}

const socialLinks = [
  { label: "Twitter", icon: <IconTwitter className="size-4.5" /> },
  { label: "Facebook", icon: <IconFacebook className="size-4.5" /> },
  { label: "TikTok", icon: <IconTikTok className="size-4.5" /> },
  { label: "Instagram", icon: <IconInstagram className="size-4.5" /> },
]

const photos = [
  { src: work, alt: "ทีมงานประชุมวางแผน" },
  { src: happyteam, alt: "ทีมงาน BidNest ยิ้มพร้อมหน้ากล้อง" },
  { src: girlgroup, alt: "ทีม Dream Team" },
  { src: boybrand, alt: "ทีมงานประชุมในห้องประชุม" },
  { src: dreamteam, alt: "ทีม Dream Team ถ่ายภาพรวมกัน" },
]

/**
 * Footer social icons currently have nowhere real to link to, so clicking
 * one opens a swipeable preview of the team photos in `app/photos` instead
 * of a dead `href="#"`.
 */
function FooterSocialLinks() {
  const [open, setOpen] = useState(false)
  const scrollerRef = useRef<HTMLDivElement>(null)

  function scrollByOne(direction: 1 | -1) {
    const el = scrollerRef.current
    if (!el) return
    el.scrollBy({ left: direction * el.clientWidth, behavior: "smooth" })
  }

  return (
    <>
      <div className="mt-8 flex justify-center gap-4 md:justify-start">
        {socialLinks.map((social) => (
          <button
            key={social.label}
            type="button"
            aria-label={social.label}
            onClick={() => setOpen(true)}
            className="flex size-10 items-center justify-center rounded-full bg-n-100 text-ink transition-colors hover:bg-amber-500 hover:text-ink"
          >
            {social.icon}
          </button>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg overflow-hidden p-0 sm:max-w-lg">
          <DialogTitle className="sr-only">ภาพทีม BidNest</DialogTitle>
          <div className="relative">
            <div
              ref={scrollerRef}
              className="flex snap-x snap-mandatory overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {photos.map((photo) => (
                <div
                  key={photo.alt}
                  className="relative aspect-square w-full flex-none snap-center"
                >
                  <Image
                    src={photo.src}
                    alt={photo.alt}
                    fill
                    className="object-contain"
                    sizes="32rem"
                  />
                </div>
              ))}
            </div>
            <Button
              type="button"
              variant="secondary"
              size="icon"
              pill
              onClick={() => scrollByOne(-1)}
              aria-label="ภาพก่อนหน้า"
              className="absolute top-1/2 left-3 -translate-y-1/2 shadow-sh1"
            >
              <ChevronLeft />
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="icon"
              pill
              onClick={() => scrollByOne(1)}
              aria-label="ภาพถัดไป"
              className="absolute top-1/2 right-3 -translate-y-1/2 shadow-sh1"
            >
              <ChevronRight />
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

export { FooterSocialLinks }
