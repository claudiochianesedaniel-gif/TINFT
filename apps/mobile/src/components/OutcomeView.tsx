import React from "react";
import {StyleSheet, Text, View} from "react-native";
import {Button} from "./Button";
import {outcomeTheme} from "../outcomes";
import type {ScanResult} from "../types";
import {colors, fonts, radius, spacing} from "../theme";

interface OutcomeViewProps {
  /** Esito dal server. Assente quando la scansione è solo accodata (offline). */
  result?: ScanResult;
  /** true = scansione accodata offline: si mostra uno stato neutro "in coda". */
  queued?: boolean;
  onDismiss: () => void;
}

// Stato neutro per le scansioni accodate: NON afferma un esito (la firma è
// verificata dal server al replay). Arancio + clessidra, distinto dai 5 esiti.
const QUEUED = {
  color: colors.orange,
  iconColor: "#3a2400",
  icon: "⏱",
  title: "In coda",
  subtitle: "Offline: la scansione sarà verificata alla sincronizzazione"
};

/** Schermata-esito a tutto pannello: colore + icona + holder/meta dei 5 stati. */
export function OutcomeView({result, queued, onDismiss}: OutcomeViewProps): React.JSX.Element {
  const theme = queued || !result ? QUEUED : outcomeTheme(result.outcome);
  const holderName = queued ? undefined : result?.holderName;
  const tokenId = queued ? undefined : result?.meta?.tokenId;

  return (
    <View style={styles.wrap}>
      <View style={[styles.badge, {backgroundColor: theme.color}]}>
        <Text style={[styles.icon, {color: theme.iconColor}]}>{theme.icon}</Text>
      </View>

      <Text style={[styles.title, {color: theme.color}]}>{theme.title}</Text>
      <Text style={styles.subtitle}>{theme.subtitle}</Text>

      {holderName ? (
        <View style={styles.metaCard}>
          <Text style={styles.metaLabel}>POSSESSORE</Text>
          <Text style={styles.metaValue}>{holderName}</Text>
          {typeof tokenId === "number" ? <Text style={styles.metaSub}>token #{tokenId}</Text> : null}
        </View>
      ) : null}

      <Button label="Scansiona il prossimo" onPress={onDismiss} style={styles.next} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.lg},
  badge: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.lg
  },
  icon: {fontSize: 46, fontWeight: "700"},
  title: {fontSize: 24, fontWeight: "700", fontFamily: fonts.bold, textAlign: "center"},
  subtitle: {color: colors.textMuted, fontSize: 13.5, textAlign: "center", marginTop: 8, fontFamily: fonts.regular},
  metaCard: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.lg,
    alignItems: "center",
    minWidth: 220
  },
  metaLabel: {color: colors.textDim, fontSize: 10, letterSpacing: 1.2, fontFamily: fonts.medium},
  metaValue: {color: colors.text, fontSize: 17, fontWeight: "600", fontFamily: fonts.semibold, marginTop: 4},
  metaSub: {color: colors.textFaint, fontSize: 12, marginTop: 3, fontFamily: fonts.regular},
  next: {marginTop: spacing.xl, alignSelf: "stretch"}
});
