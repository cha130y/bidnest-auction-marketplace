import "@testing-library/jest-dom/vitest"

import { cleanup } from "@testing-library/react"
import { afterEach } from "vitest"

/**
 * Every case renders into the same document, so a component one test left
 * mounted is still findable in the next one — and a `getByRole` that matches
 * two elements throws rather than picking one. Unmount between them.
 */
afterEach(cleanup)
