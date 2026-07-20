import { z } from "zod"

export const TuiSidebarConfigSchema = z.object({
  // Keep this optional so runtime wiring can distinguish an explicit user
  // preference from the mode-specific default.
  enabled: z.boolean().optional(),
})

export const TuiConfigSchema = z.object({
  sidebar: TuiSidebarConfigSchema.default({}),
})

export type TuiConfig = z.infer<typeof TuiConfigSchema>
