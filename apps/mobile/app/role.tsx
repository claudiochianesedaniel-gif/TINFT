import React from "react";
import {Pressable, StyleSheet, Text, View} from "react-native";
import {useRouter} from "expo-router";
import {Screen} from "@/components/Screen";
import {useAuth} from "@/auth-context";
import {colors, fonts, radius, spacing} from "@/theme";

export default function RoleScreen(): React.JSX.Element {
  const router = useRouter();
  const {account, logout} = useAuth();

  return (
    <Screen>
      <View style={styles.topRow}>
        <Text style={styles.brand}>TINFT</Text>
        <Pressable onPress={logout} hitSlop={8}>
          <Text style={styles.logout}>Esci</Text>
        </Pressable>
      </View>

      <Text style={styles.hello}>Ciao {account?.nome ?? ""}</Text>
      <Text style={styles.subtitle}>Scegli come usare l'app per questo accesso.</Text>

      <Pressable style={[styles.card, styles.cardCliente]} onPress={() => router.push("/cliente")}>
        <Text style={[styles.profileTag, {color: colors.blueSoft}]}>PROFILO 01</Text>
        <Text style={styles.cardTitle}>Sono un Cliente</Text>
        <Text style={styles.cardDesc}>Apri i tuoi biglietti e mostra il QR a rotazione all'ingresso.</Text>
      </Pressable>

      <Pressable style={[styles.card, styles.cardValidatore]} onPress={() => router.push("/validatore")}>
        <Text style={[styles.profileTag, {color: colors.greenBright}]}>PROFILO 02 · STAFF VARCO</Text>
        <Text style={styles.cardTitle}>Sono un Validatore</Text>
        <Text style={styles.cardDesc}>Scansiona il QR (o NFC su Android) e verifica l'esito al varco.</Text>
      </Pressable>

      <Text style={styles.note}>
        La verifica degli accessi e i 5 esiti (valido / screenshot / duplicato / escrow / falso) sono applicati lato server.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topRow: {flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.xl},
  brand: {color: colors.text, fontSize: 16, fontWeight: "700", letterSpacing: 1, fontFamily: fonts.bold},
  logout: {color: colors.textFaint, fontSize: 13, fontFamily: fonts.medium},
  hello: {color: colors.text, fontSize: 26, fontWeight: "700", fontFamily: fonts.bold, marginBottom: 4},
  subtitle: {color: colors.textMuted, fontSize: 13, marginBottom: spacing.lg, fontFamily: fonts.regular},
  card: {
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1
  },
  cardCliente: {backgroundColor: "#1a2540", borderColor: colors.blue},
  cardValidatore: {backgroundColor: "#13241c", borderColor: colors.greenDeep},
  profileTag: {fontSize: 10, letterSpacing: 1.4, fontFamily: fonts.medium},
  cardTitle: {color: colors.text, fontSize: 19, fontWeight: "600", fontFamily: fonts.semibold, marginTop: spacing.sm},
  cardDesc: {color: colors.textMuted, fontSize: 12.5, lineHeight: 18, marginTop: 6, fontFamily: fonts.regular},
  note: {color: colors.textFaint, fontSize: 11, lineHeight: 17, marginTop: spacing.md, fontFamily: fonts.regular}
});
