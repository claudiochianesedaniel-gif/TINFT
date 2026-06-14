/**
 * Token di design TINFT (look "v2/v3" dei prototipi): sfondo scuro #0a0a0a,
 * blu #4472c4, verde #00cc88, angoli arrotondati 13px, font Quicksand.
 * Tenuti in un solo posto così le schermate restano coerenti.
 */
export const colors = {
  bg: "#0a0a0a",
  surface: "#131313",
  surfaceAlt: "#1c1c1c",
  border: "#2a2a2a",
  borderSoft: "#3a3a38",

  text: "#ffffff",
  textMuted: "#8a8682",
  textFaint: "#6a6764",
  textDim: "#5a5754",

  blue: "#4472c4",
  blueBright: "#6f9eff",
  blueSoft: "#aac3f5",

  green: "#00cc88",
  greenBright: "#5fe0b0",
  greenDeep: "#0a8a5c",
  onGreen: "#06210f",

  orange: "#ff9900",
  orangeSoft: "#ffcf80",
  orangeBorder: "#9c5e00",

  red: "#ff5577",
  redSoft: "#ff8aa0"
} as const;

export const radius = {
  sm: 8,
  md: 13,
  lg: 18,
  pill: 999
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 14,
  lg: 20,
  xl: 28
} as const;

/**
 * Quicksand viene caricato con expo-font (vedi app/_layout.tsx). I pesi qui sono
 * i family-name registrati; finché il font non è pronto si usa il system font.
 */
export const fonts = {
  regular: "Quicksand_400Regular",
  medium: "Quicksand_500Medium",
  semibold: "Quicksand_600SemiBold",
  bold: "Quicksand_700Bold"
} as const;
