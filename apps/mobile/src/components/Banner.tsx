import React from "react";
import {StyleSheet, Text, View} from "react-native";
import {colors, fonts, radius, spacing} from "../theme";

type Tone = "info" | "warn" | "error" | "success";

interface BannerProps {
  tone?: Tone;
  children: React.ReactNode;
}

const TONES: Record<Tone, {border: string; text: string}> = {
  info: {border: colors.blue, text: colors.blueSoft},
  warn: {border: colors.orangeBorder, text: colors.orangeSoft},
  error: {border: colors.red, text: colors.redSoft},
  success: {border: colors.greenDeep, text: colors.greenBright}
};

/** Banner inline (offline/in coda/errore/sync ok) coerente coi colori del prototipo. */
export function Banner({tone = "info", children}: BannerProps): React.JSX.Element {
  const t = TONES[tone];
  return (
    <View style={[styles.wrap, {borderColor: t.border}]}>
      <Text style={[styles.text, {color: t.text}]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderWidth: 1,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    marginBottom: spacing.md
  },
  text: {fontSize: 12, lineHeight: 18, fontFamily: fonts.regular}
});
