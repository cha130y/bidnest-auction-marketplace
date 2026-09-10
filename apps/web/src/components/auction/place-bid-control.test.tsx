import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { PlaceBidControl } from "@/components/auction/place-bid-control"
import { placeBid } from "@/lib/api/auctions"
import { ApiError } from "@/lib/api/client"
import type { ArenaParticipation, Auction } from "@/lib/api/types"

const push = vi.fn()

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}))

vi.mock("@/lib/api/auctions", () => ({
  placeBid: vi.fn(),
}))

const placeBidMock = vi.mocked(placeBid)

/**
 * Only the three fields the control reads. Cast rather than filled out,
 * because an `Auction` is twenty-six fields and twenty-three of them would be
 * noise here — if this control starts reading a fourth, this is the line that
 * has to change.
 */
const auctionOf = (overrides: Partial<Auction> = {}) =>
  ({
    id: "auction-1",
    minimumNextBid: "3100.00",
    minBidIncrement: "100.00",
    ...overrides,
  }) as unknown as Auction

const bidder: ArenaParticipation = {
  joined: true,
  joinedAt: null,
  canBid: true,
  blockedBy: null,
}

const accepted = (amount: string) =>
  ({ amount }) as unknown as Awaited<ReturnType<typeof placeBid>>

beforeEach(() => {
  vi.clearAllMocks()
})

describe("PlaceBidControl", () => {
  describe("when nobody is signed in", () => {
    it("offers the sign-in link instead of the form", () => {
      render(<PlaceBidControl auction={auctionOf()} you={null} />)

      expect(
        screen.getByRole("button", { name: "เข้าสู่ระบบเพื่อเสนอราคา" })
      ).toBeInTheDocument()
      expect(
        screen.queryByLabelText(/เสนอราคาอย่างน้อย/)
      ).not.toBeInTheDocument()
    })

    it("sends them to login carrying where they were", async () => {
      const user = userEvent.setup()
      render(<PlaceBidControl auction={auctionOf()} you={null} />)

      await user.click(screen.getByRole("button"))

      expect(push).toHaveBeenCalledWith(
        expect.stringContaining("/login?callbackUrl=")
      )
    })
  })

  /**
   * The rules about sellers and admins live on the server. All this checks is
   * that each answer it can give reaches the screen as a sentence, rather than
   * as a blank refusal the bidder cannot act on.
   */
  describe("when the API says they may not bid", () => {
    it("says why, in the case the API named", () => {
      render(
        <PlaceBidControl
          auction={auctionOf()}
          you={{ ...bidder, canBid: false, blockedBy: "YOU_ARE_THE_SELLER" }}
        />
      )

      expect(
        screen.getByText("คุณเป็นผู้ขายรายการนี้ จึงเสนอราคาไม่ได้")
      ).toBeInTheDocument()
    })

    it("falls back to a plain refusal when it named no reason", () => {
      render(
        <PlaceBidControl
          auction={auctionOf()}
          you={{ ...bidder, canBid: false, blockedBy: null }}
        />
      )

      expect(screen.getByText("ตอนนี้เสนอราคาไม่ได้")).toBeInTheDocument()
    })
  })

  describe("placing a bid", () => {
    const renderForm = (auction = auctionOf()) => {
      const onBidPlaced = vi.fn()
      render(
        <PlaceBidControl
          auction={auction}
          you={bidder}
          onBidPlaced={onBidPlaced}
        />
      )
      return { onBidPlaced, user: userEvent.setup() }
    }

    const amountField = () => screen.getByLabelText(/เสนอราคาอย่างน้อย/)
    const submitButton = () => screen.getByRole("button", { name: "เสนอราคา" })

    it("refuses an amount that is not a number without troubling the API", async () => {
      const { user } = renderForm()

      await user.click(submitButton())

      expect(screen.getByRole("alert")).toHaveTextContent(
        "กรอกจำนวนเงินให้ถูกต้อง"
      )
      expect(placeBidMock).not.toHaveBeenCalled()
    })

    /**
     * The refusal has to be this sentence and not the browser's own. The field
     * carries `min`, so without `noValidate` on the form the submit never
     * reaches `submit` at all and a Thai buyer is shown a native tooltip in
     * whatever language the browser is set to — delete that attribute and this
     * is the test that goes red.
     */
    it("refuses an amount below the minimum in its own words, without troubling the API", async () => {
      const { user } = renderForm()

      await user.type(amountField(), "3000")
      await user.click(submitButton())

      expect(screen.getByRole("alert")).toHaveTextContent(
        "ต้องเสนออย่างน้อย ฿3,100.00"
      )
      expect(placeBidMock).not.toHaveBeenCalled()
    })

    it("sends the bid and confirms with the amount the API accepted", async () => {
      placeBidMock.mockResolvedValue(accepted("3100.00"))
      const { user, onBidPlaced } = renderForm()

      await user.type(amountField(), "3100")
      await user.click(submitButton())

      expect(placeBidMock).toHaveBeenCalledWith("auction-1", {
        amount: 3100,
        clientRequestId: expect.any(String) as string,
      })
      expect(
        await screen.findByText("รับการเสนอราคาที่ ฿3,100.00 แล้ว")
      ).toBeInTheDocument()
      expect(amountField()).toHaveValue(null)
      expect(onBidPlaced).toHaveBeenCalledOnce()
    })

    it("shows the API's own refusal rather than a generic one", async () => {
      placeBidMock.mockRejectedValue(
        new ApiError(409, "มีคนเสนอราคาสูงกว่าแล้ว")
      )
      const { user } = renderForm()

      await user.type(amountField(), "3100")
      await user.click(submitButton())

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "มีคนเสนอราคาสูงกว่าแล้ว"
      )
    })

    /**
     * BID-002 — the test the API cannot run for itself.
     *
     * A dropped connection leaves the browser unable to tell "the bid never
     * arrived" from "the bid was accepted and the reply was lost". The API
     * answers a repeated `clientRequestId` with the original bid, so pressing
     * the button again must replay the same id — send a fresh one and the
     * buyer has bid twice.
     */
    it("replays the same attempt id when a failed bid is tried again", async () => {
      placeBidMock.mockRejectedValueOnce(new ApiError(503, "เครือข่ายขัดข้อง"))
      placeBidMock.mockResolvedValueOnce(accepted("3100.00"))
      const { user } = renderForm()

      await user.type(amountField(), "3100")
      await user.click(submitButton())
      await screen.findByRole("alert")

      await user.click(submitButton())
      await screen.findByText("รับการเสนอราคาที่ ฿3,100.00 แล้ว")

      const [[, first], [, second]] = placeBidMock.mock.calls
      expect(second.clientRequestId).toBe(first.clientRequestId)
    })

    it("starts a fresh attempt id once a bid has been accepted", async () => {
      placeBidMock.mockResolvedValue(accepted("3100.00"))
      const { user } = renderForm()

      await user.type(amountField(), "3100")
      await user.click(submitButton())
      await screen.findByText("รับการเสนอราคาที่ ฿3,100.00 แล้ว")

      await user.type(amountField(), "3200")
      await user.click(submitButton())

      const [[, first], [, second]] = placeBidMock.mock.calls
      expect(second.clientRequestId).not.toBe(first.clientRequestId)
    })
  })

  describe("the quick amounts", () => {
    it("offers the minimum and two steps above it", () => {
      render(<PlaceBidControl auction={auctionOf()} you={bidder} />)

      expect(
        screen.getByRole("button", { name: "฿3,100.00" })
      ).toBeInTheDocument()
      expect(
        screen.getByRole("button", { name: "฿3,200.00" })
      ).toBeInTheDocument()
      expect(
        screen.getByRole("button", { name: "฿3,600.00" })
      ).toBeInTheDocument()
    })

    it("fills the field rather than bidding, so nobody bids by mis-tapping", async () => {
      const user = userEvent.setup()
      render(<PlaceBidControl auction={auctionOf()} you={bidder} />)

      await user.click(screen.getByRole("button", { name: "฿3,200.00" }))

      expect(screen.getByLabelText(/เสนอราคาอย่างน้อย/)).toHaveValue(3200)
      expect(placeBidMock).not.toHaveBeenCalled()
    })

    it("offers the minimum alone when the increment is unusable", () => {
      render(
        <PlaceBidControl
          auction={auctionOf({ minBidIncrement: "0" })}
          you={bidder}
        />
      )

      expect(
        screen
          .getAllByRole("button", { name: /^฿/ })
          .map((button) => button.textContent)
      ).toEqual(["฿3,100.00"])
    })
  })
})
