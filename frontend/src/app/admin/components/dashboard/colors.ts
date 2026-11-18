import type { ChartConfig } from "@/components/ui/chart"

// Categorical chart colors in their fixed order, checked for color vision deficiencies and contrast as a set (the third
// is below 3:1 on white, so every chart using it also offers its values as a table)
export const SERIES_COLORS = [
  { light: "#2a78d6", dark: "#3987e5" },
  { light: "#eb6834", dark: "#d95926" },
  { light: "#1baf7a", dark: "#199e70" },
] satisfies ChartConfig[string]["theme"][]
