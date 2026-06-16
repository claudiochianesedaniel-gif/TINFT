import React from "react";
import {Pressable, StyleSheet, Text, View} from "react-native";
import {colors, fonts, spacing} from "../theme";

interface HeaderProps {
  title: string;
  kicker?: string;
  onBack?: () => void;
  right?: React.ReactNode;
}

/** Intestazione di schermata: kicker piccolo + titolo, freccia indietro opzionale. */
export function Header({title, kicker, onBack, right}: HeaderProps): React.JSX.Element {
  return (
    <View style={styles.wrap}>
      <View style={styles.left}>
        {onBack ? (
          <Pressable onPress={onBack} hitSlop={12} accessibilityRole="button" accessibilityLabel="Indietro">
            <Text style={styles.back}>‹</Text>
          </Pressable>
        ) : null}
        <View style={styles.titles}>
          {kicker ? <Text style={styles.kicker}>{kicker}</Text> : null}
          <Text style={styles.title}>{title}</Text>
        </View>
      </View>
      {right ? <View>{right}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.lg
  },
  left: {flexDirection: "row", alignItems: "center", flex: 1},
  back: {color: colors.blueBright, fontSize: 30, marginRight: spacing.md, marginTop: -4},
  titles: {flex: 1},
  kicker: {color: colors.textFaint, fontSize: 10, letterSpacing: 1.4, fontFamily: fonts.medium, marginBottom: 3},
  title: {color: colors.text, fontSize: 22, fontWeight: "700", fontFamily: fonts.bold}
});
