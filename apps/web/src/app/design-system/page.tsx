import { Search } from "lucide-react"

import { SiteHeader } from "@/components/layout/site-header"
import { SiteFooter } from "@/components/layout/site-footer"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"

function Section({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <section className="border-t border-n-200 py-12 first:border-t-0">
      <h2 className="font-display text-2xl font-bold text-ink">{title}</h2>
      {description && (
        <p className="mt-2 max-w-2xl text-sm text-n-500">{description}</p>
      )}
      <div className="mt-6">{children}</div>
    </section>
  )
}

const colorSwatches = [
  { name: "Amber 600", cls: "bg-amber-600", hex: "#E28E0C" },
  { name: "Amber 500", cls: "bg-amber-500", hex: "#F5A524" },
  { name: "Amber 400", cls: "bg-amber-400", hex: "#FBB94A" },
  { name: "Amber 200", cls: "bg-amber-200", hex: "#FADFB0" },
  { name: "Amber 100", cls: "bg-amber-100", hex: "#FEEFD2" },
  { name: "Amber 50", cls: "bg-amber-50", hex: "#FFF8EC" },
  { name: "Ink", cls: "bg-ink", hex: "#20242E" },
  { name: "Neutral 600", cls: "bg-n-600", hex: "#545A66" },
  { name: "Neutral 400", cls: "bg-n-400", hex: "#AAB0BA" },
  { name: "Neutral 200", cls: "bg-n-200", hex: "#E8EAEE" },
  { name: "Neutral 100", cls: "bg-n-100", hex: "#F4F5F7" },
  { name: "Red", cls: "bg-red", hex: "#EF4A3C" },
  { name: "Green", cls: "bg-green", hex: "#1FA971" },
]

export default function DesignSystemPage() {
  return (
    <div className="flex min-h-full flex-col bg-n-100">
      <SiteHeader activeHref="/" cartCount={2} wishlistActive />

      <main className="mx-auto w-full max-w-330 flex-1 px-4 md:px-6">
        <div className="border-b border-n-200 py-12">
          <span className="inline-block rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-600">
            Design system · Dev 1
          </span>
          <h1 className="mt-4 font-display text-4xl font-extrabold tracking-tight text-ink md:text-5xl">
            BidNest UI Kit
          </h1>
          <p className="mt-3 max-w-2xl text-base text-n-600">
            Core primitives translated from the Figma component sheet, wired
            to shadcn-ui + Tailwind v4 design tokens. Product, cart, and
            auction-specific compositions live in each module&apos;s own
            branch — this page only covers the shared foundation.
          </p>
        </div>

        <Section title="Color" description="Amber is the one brand accent — everything else stays neutral.">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {colorSwatches.map((c) => (
              <div key={c.name} className="overflow-hidden rounded-r3 bg-white shadow-sh1">
                <div className={`h-16 ${c.cls}`} />
                <div className="p-3">
                  <div className="text-xs font-bold text-ink">{c.name}</div>
                  <div className="text-xs text-n-500">{c.hex}</div>
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Typography" description="Poppins for display, Plus Jakarta Sans for body, Noto Sans Thai fallback for Thai copy.">
          <div className="flex flex-col gap-4">
            <div className="font-display text-5xl font-extrabold text-ink">Live now</div>
            <div className="font-display text-3xl font-bold text-ink">Vintage Leica M6</div>
            <div className="font-body text-lg text-n-700">Place a bid or buy it now — your call.</div>
            <div className="font-body text-base text-n-700">ประมูลของสภาพดี พร้อมเลนส์และกล้องอิสระ รับประกันตัวตนผู้ขายทุกรายที่ยืนยันแล้ว</div>
            <div className="font-body text-sm text-n-500">Free returns within 7 days · Buyer protection included</div>
          </div>
        </Section>

        <Section title="Buttons">
          <div className="flex flex-col gap-6">
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="primary">Place bid</Button>
              <Button variant="dark">Buy now</Button>
              <Button variant="secondary">Add to cart</Button>
              <Button variant="ghost">Cancel</Button>
              <Button variant="danger">Remove</Button>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button size="sm">Small</Button>
              <Button size="md">Medium</Button>
              <Button size="lg">Large</Button>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button pill>Pill</Button>
              <Button variant="dark" pill>Pill dark</Button>
              <Button disabled>Disabled</Button>
            </div>
            <Button block size="lg" className="max-w-sm">
              Block button
            </Button>
          </div>
        </Section>

        <Section title="Badges">
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant="live" dot>Live</Badge>
            <Badge variant="ending">Ending soon</Badge>
            <Badge variant="new">New</Badge>
            <Badge variant="sale">−20% Sale</Badge>
            <Badge variant="won">Won</Badge>
            <Badge variant="sold">Sold</Badge>
            <Badge variant="verified">Verified seller</Badge>
          </div>
        </Section>

        <Section title="Inputs">
          <div className="grid max-w-2xl gap-6 sm:grid-cols-2">
            <Input placeholder="Search product" pill startIcon={<Search />} />
            <Input placeholder="Enter card number" />
            <Input placeholder="Enter card number" invalid />
            <Select>
              <SelectTrigger>
                <SelectValue placeholder="By rating" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="rating">By rating</SelectItem>
                <SelectItem value="newest">Newest first</SelectItem>
                <SelectItem value="price">Price: low to high</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </Section>

        <Section title="Checkbox, Radio & Switch">
          <div className="flex flex-wrap gap-16">
            <div className="flex flex-col gap-3">
              <label className="flex items-center gap-3 text-ink">
                <Checkbox defaultChecked /> Enable anti-snipe bidding
              </label>
              <label className="flex items-center gap-3 text-ink">
                <Checkbox /> Email me when I&apos;m outbid
              </label>
            </div>
            <RadioGroup defaultValue="standard" className="gap-3">
              <label className="flex items-center gap-3 text-ink">
                <RadioGroupItem value="standard" /> Standard shipping
              </label>
              <label className="flex items-center gap-3 text-ink">
                <RadioGroupItem value="express" /> Express
              </label>
            </RadioGroup>
            <div className="flex flex-col gap-3">
              <label className="flex items-center gap-3 text-ink">
                <Switch defaultChecked /> Auto-extend on last-second bids
              </label>
              <label className="flex items-center gap-3 text-ink">
                <Switch /> Show my bids publicly
              </label>
            </div>
          </div>
        </Section>

        <Section title="Tabs">
          <Tabs defaultValue="details">
            <TabsList>
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="history">Bid history</TabsTrigger>
              <TabsTrigger value="shipping">Shipping</TabsTrigger>
              <TabsTrigger value="reviews">Reviews</TabsTrigger>
            </TabsList>
            <TabsContent value="details" className="text-sm text-n-600">
              Panel content lives here — each module wires its own.
            </TabsContent>
          </Tabs>
        </Section>

        <Section title="Pagination">
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious href="#" />
              </PaginationItem>
              <PaginationItem>
                <PaginationLink href="#" isActive>1</PaginationLink>
              </PaginationItem>
              <PaginationItem>
                <PaginationLink href="#">2</PaginationLink>
              </PaginationItem>
              <PaginationItem>
                <PaginationLink href="#">3</PaginationLink>
              </PaginationItem>
              <PaginationItem>
                <PaginationEllipsis />
              </PaginationItem>
              <PaginationItem>
                <PaginationLink href="#">12</PaginationLink>
              </PaginationItem>
              <PaginationItem>
                <PaginationNext href="#" />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </Section>

        <Section title="Card" description="Base surface only — product/lot/detail cards are composed per module.">
          <Card className="max-w-sm">
            <CardHeader>
              <CardTitle>Card title</CardTitle>
              <CardDescription>
                Base Card primitive: rounded-r4, shadow-sh1, white surface.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-n-600">
              Compose ProductCard / AuctionLotCard on top of this in each
              module.
            </CardContent>
          </Card>
        </Section>
      </main>

      <SiteFooter />
    </div>
  )
}
