import type {ConfigContext, ExpoConfig} from "expo/config";

/**
 * Estende app.json a runtime per iniettare l'URL del backend da variabile d'ambiente.
 *
 * Imposta `API_BASE` (o `EXPO_PUBLIC_API_BASE`) quando avvii Expo per puntare al
 * tuo backend in LAN o deployato, es.:
 *
 *   API_BASE=http://192.168.1.50:3001 npx expo start
 *
 * Se non impostata, l'app ricade sul default in `src/config.ts`.
 * Il valore finisce in `Constants.expoConfig.extra.apiBase` e viene letto da `src/config.ts`.
 */
export default ({config}: ConfigContext): ExpoConfig => {
  const apiBase = process.env.API_BASE ?? process.env.EXPO_PUBLIC_API_BASE;
  return {
    ...config,
    name: config.name ?? "TINFT",
    slug: config.slug ?? "tinft-mobile",
    extra: {
      ...config.extra,
      apiBase: apiBase ?? null
    }
  };
};
