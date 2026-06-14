import React, {useEffect, useMemo, useState} from "react";
import {ActivityIndicator, Platform, StyleSheet, Text, View} from "react-native";
import {useLocalSearchParams, useRouter} from "expo-router";
import QRCode from "react-native-qrcode-svg";
import {Screen} from "@/components/Screen";
import {Header} from "@/components/Header";
import {Banner} from "@/components/Banner";
import {Card} from "@/components/Card";
import {useSession} from "@/auth-context";
import {api} from "@/api";
import {useRotatingToken} from "@/useRotatingToken";
import {euros} from "@/format";
import type {Ticket} from "@/types";
import {colors, fonts, spacing} from "@/theme";

const QR_SIZE = 240;

export default function TicketDetailScreen(): React.JSX.Element {
  const router = useRouter();
  const {ticketId} = useLocalSearchParams<{ticketId: string}>();
  const {token, account} = useSession();
  const id = String(ticketId);

  const {token: accessToken, secondsLeft, error, loading} = useRotatingToken(id, token);

  // Carica i dati del biglietto (per testata) dalla lista dell'account.
  const [ticket, setTicket] = useState<Ticket | null>(null);
  useEffect(() => {
    let active = true;
    api
      .myTickets(account.id, token)
      .then((list) => {
        if (active) setTicket(list.find((t) => t.id === id) ?? null);
      })
      .catch(() => {
        /* la testata è informativa: l'errore sul QR è già mostrato sotto */
      });
    return () => {
      active = false;
    };
  }, [id, account.id, token]);

  const headerTitle = ticket?.holderName ?? "Biglietto";

  return (
    <Screen>
      <Header title={headerTitle} kicker="QR DI ACCESSO" onBack={() => router.back()} />

      {ticket ? (
        <Card style={styles.infoCard} accent={colors.blue}>
          <Text style={styles.infoLabel}>TOKEN NFT</Text>
          <Text style={styles.infoValue}>#{ticket.tokenId}</Text>
          <Text style={styles.infoMeta}>
            {euros(ticket.originalPriceCents)} · {ticket.kind === "FIDELITY" ? "Fidelity" : "Biglietto evento"}
          </Text>
        </Card>
      ) : null}

      {error ? <Banner tone="error">{error}</Banner> : null}

      <View style={styles.qrWrap}>
        <View style={styles.qrFrame}>
          {accessToken ? (
            <QRCode
              value={accessToken}
              size={QR_SIZE}
              backgroundColor="#ffffff"
              color="#000000"
              quietZone={12}
            />
          ) : (
            <View style={[styles.qrPlaceholder, {width: QR_SIZE, height: QR_SIZE}]}>
              <ActivityIndicator color={colors.bg} />
            </View>
          )}
        </View>

        <Rotation secondsLeft={secondsLeft} loading={loading && !accessToken} />
      </View>

      <Text style={styles.help}>
        Mostra questo codice al varco. Ruota automaticamente: uno screenshot scade in pochi secondi.
      </Text>

      <NfcAffordance />
    </Screen>
  );
}

function Rotation({secondsLeft, loading}: {secondsLeft: number; loading: boolean}): React.JSX.Element {
  return (
    <View style={styles.rotation}>
      <View style={[styles.dot, {backgroundColor: colors.greenBright}]} />
      <Text style={styles.rotationText}>
        {loading ? "Generazione codice…" : `codice valido · ruota tra ${secondsLeft}s`}
      </Text>
    </View>
  );
}

/**
 * Affordance NFC SOLO su Android (informativa nella schermata cliente): mostrare
 * il biglietto via "tap" richiede l'emulazione di tag (HCE), disponibile solo su
 * Android e non implementata in questo client demo. Su iOS l'NFC peer-to-peer non
 * esiste → si usa il QR. Vedi README per i dettagli HCE.
 */
function NfcAffordance(): React.JSX.Element | null {
  const isAndroid = useMemo(() => Platform.OS === "android", []);
  if (!isAndroid) return null;
  return (
    <View style={styles.nfcBox}>
      <Text style={styles.nfcTitle}>Avvicina (NFC)</Text>
      <Text style={styles.nfcText}>
        Su Android il biglietto può essere presentato anche via NFC (Host Card Emulation). In questa build demo l'HCE non
        è attivo: usa il QR qui sopra.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  infoCard: {marginBottom: spacing.lg},
  infoLabel: {color: colors.blueSoft, fontSize: 10, letterSpacing: 1.2, fontFamily: fonts.medium},
  infoValue: {color: colors.text, fontSize: 24, fontWeight: "700", fontFamily: fonts.bold, marginTop: 6},
  infoMeta: {color: colors.textMuted, fontSize: 12.5, marginTop: 4, fontFamily: fonts.regular},
  qrWrap: {alignItems: "center", marginTop: spacing.sm},
  qrFrame: {backgroundColor: "#ffffff", padding: spacing.md, borderRadius: 18},
  qrPlaceholder: {alignItems: "center", justifyContent: "center"},
  rotation: {flexDirection: "row", alignItems: "center", marginTop: spacing.lg},
  dot: {width: 8, height: 8, borderRadius: 4, marginRight: 7},
  rotationText: {color: colors.blueSoft, fontSize: 12, fontFamily: fonts.medium},
  help: {color: colors.textMuted, fontSize: 12.5, lineHeight: 18, textAlign: "center", marginTop: spacing.lg, fontFamily: fonts.regular},
  nfcBox: {
    marginTop: spacing.xl,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: 13,
    padding: spacing.md,
    backgroundColor: colors.surfaceAlt
  },
  nfcTitle: {color: colors.blueBright, fontSize: 13, fontWeight: "600", fontFamily: fonts.semibold, marginBottom: 4},
  nfcText: {color: colors.textMuted, fontSize: 12, lineHeight: 17, fontFamily: fonts.regular}
});
