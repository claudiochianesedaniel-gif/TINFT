import React, {useCallback, useEffect, useRef, useState} from "react";
import {Alert, Platform, Pressable, StyleSheet, Text, View} from "react-native";
import {CameraView, useCameraPermissions} from "expo-camera";
import {useFocusEffect, useRouter} from "expo-router";
import {Screen} from "@/components/Screen";
import {Header} from "@/components/Header";
import {Button} from "@/components/Button";
import {Banner} from "@/components/Banner";
import {OutcomeView} from "@/components/OutcomeView";
import {useSession} from "@/auth-context";
import {api, ApiError} from "@/api";
import {enqueueScan, queueCount, syncQueue} from "@/offline-queue";
import {getNfcAvailability, nfcUnavailableMessage, readNfcToken} from "@/nfc";
import type {ScanResult} from "@/types";
import {colors, fonts, radius, spacing} from "@/theme";

type Mode = "scanning" | "result";

export default function ScanScreen(): React.JSX.Element {
  const router = useRouter();
  const {token, account} = useSession();
  const [permission, requestPermission] = useCameraPermissions();

  const [view, setView] = useState<Mode>("scanning");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [queued, setQueued] = useState(false);
  const [queueLen, setQueueLen] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Evita scansioni multiple dello stesso frame (la camera emette in raffica).
  const lockRef = useRef(false);

  const refreshQueueCount = useCallback(async () => {
    setQueueLen(await queueCount());
  }, []);

  useEffect(() => {
    void refreshQueueCount();
  }, [refreshQueueCount]);

  // Chiedi il permesso fotocamera al primo ingresso.
  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) void requestPermission();
  }, [permission, requestPermission]);

  /** Valida un token d'accesso (da QR o NFC): chiama il server, accoda se offline. */
  const validateToken = useCallback(
    async (accessToken: string) => {
      setBusy(true);
      try {
        const res = await api.scan(accessToken, token, account.id);
        setResult(res);
        setQueued(false);
        setView("result");
      } catch (err) {
        if (err instanceof ApiError && err.isNetwork) {
          // Offline: accoda e mostra uno stato neutro "in coda" (la firma è verificata
          // dal server al replay: NON affermiamo un esito qui).
          await enqueueScan({accessToken, validatorId: account.id});
          await refreshQueueCount();
          setResult(null);
          setQueued(true);
          setView("result");
        } else {
          Alert.alert("Errore", err instanceof ApiError ? err.message : "Scansione non riuscita.");
          lockRef.current = false; // consenti un nuovo tentativo
        }
      } finally {
        setBusy(false);
      }
    },
    [token, account.id, refreshQueueCount]
  );

  const onBarcodeScanned = useCallback(
    ({data}: {data: string}) => {
      if (lockRef.current || view !== "scanning" || busy) return;
      lockRef.current = true;
      void validateToken(data.trim());
    },
    [validateToken, view, busy]
  );

  const resumeScanning = useCallback(() => {
    setResult(null);
    setQueued(false);
    setView("scanning");
    lockRef.current = false;
  }, []);

  // Reset del lock quando la schermata torna in primo piano.
  useFocusEffect(
    useCallback(() => {
      lockRef.current = false;
      return () => {
        lockRef.current = true; // blocca mentre non è a fuoco
      };
    }, [])
  );

  async function onSync(): Promise<void> {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const report = await syncQueue(token);
      await refreshQueueCount();
      setSyncMsg(
        report.synced > 0
          ? `Sincronizzate ${report.synced} scansioni · ${report.remaining} in coda`
          : report.remaining > 0
            ? `Ancora offline · ${report.remaining} in coda`
            : "Coda vuota"
      );
    } catch {
      setSyncMsg("Sincronizzazione non riuscita.");
    } finally {
      setSyncing(false);
    }
  }

  async function onReadNfc(): Promise<void> {
    const avail = await getNfcAvailability();
    if (!avail.supported) {
      Alert.alert("NFC", nfcUnavailableMessage(avail.reason));
      return;
    }
    if (!avail.enabled) {
      Alert.alert("NFC disattivato", "Attiva l'NFC nelle impostazioni del telefono e riprova.");
      return;
    }
    try {
      const nfcToken = await readNfcToken();
      if (!nfcToken) {
        Alert.alert("NFC", "Nessun token leggibile sul tag.");
        return;
      }
      lockRef.current = true;
      await validateToken(nfcToken);
    } catch (err) {
      Alert.alert("NFC", err instanceof Error ? err.message : "Lettura NFC non riuscita.");
    }
  }

  // ---- Render dell'esito (anche stato "in coda" quando offline) ----
  if (view === "result" && (result || queued)) {
    return (
      <Screen scroll={false}>
        <Header title="Esito" kicker="VARCO" onBack={() => router.replace("/role")} />
        <OutcomeView result={result ?? undefined} queued={queued} onDismiss={resumeScanning} />
      </Screen>
    );
  }

  // ---- Permesso fotocamera ----
  if (!permission) {
    return (
      <Screen center>
        <Text style={styles.dim}>Inizializzazione fotocamera…</Text>
      </Screen>
    );
  }
  if (!permission.granted) {
    return (
      <Screen>
        <Header title="Fotocamera" kicker="VARCO" onBack={() => router.replace("/role")} />
        <Banner tone="warn">
          Serve il permesso fotocamera per scansionare i QR. Se l'hai negato, abilitalo dalle impostazioni del sistema.
        </Banner>
        <Button label="Concedi accesso alla fotocamera" onPress={requestPermission} />
        {Platform.OS === "android" ? (
          <Button label="Leggi NFC" variant="secondary" onPress={onReadNfc} style={{marginTop: spacing.sm}} />
        ) : null}
      </Screen>
    );
  }

  // ---- Scanner ----
  return (
    <Screen scroll={false}>
      <Header
        title="Scansiona"
        kicker={`VARCO · ${account.nome}`}
        onBack={() => router.replace("/role")}
      />

      {queueLen > 0 ? (
        <Banner tone="warn">
          {queueLen} {queueLen === 1 ? "scansione in coda" : "scansioni in coda"} (offline). Tocca “Sincronizza” quando torni
          online.
        </Banner>
      ) : null}
      {syncMsg ? <Banner tone="success">{syncMsg}</Banner> : null}

      <View style={styles.cameraWrap}>
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{barcodeTypes: ["qr"]}}
          onBarcodeScanned={view === "scanning" ? onBarcodeScanned : undefined}
        />
        <View style={styles.reticle} pointerEvents="none" />
        {busy ? (
          <View style={styles.busyOverlay} pointerEvents="none">
            <Text style={styles.busyText}>Verifica…</Text>
          </View>
        ) : null}
      </View>

      <Text style={styles.hint}>Inquadra il QR del biglietto. La verifica e l'esito arrivano dal server.</Text>

      <View style={styles.actions}>
        {Platform.OS === "android" ? (
          <Button label="Leggi NFC" variant="secondary" onPress={onReadNfc} style={styles.action} />
        ) : (
          <Pressable onPress={() => Alert.alert("NFC", nfcUnavailableMessage("ios"))} style={styles.iosNfcNote}>
            <Text style={styles.iosNfcText}>NFC non disponibile su iOS · usa il QR</Text>
          </Pressable>
        )}
        <Button
          label={syncing ? "Sincronizzo…" : "Sincronizza"}
          variant="secondary"
          onPress={onSync}
          loading={syncing}
          disabled={queueLen === 0 && !syncing}
          style={styles.action}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  dim: {color: colors.textMuted, fontSize: 14, textAlign: "center", fontFamily: fonts.regular},
  cameraWrap: {
    flex: 1,
    borderRadius: radius.lg,
    overflow: "hidden",
    backgroundColor: "#000",
    marginBottom: spacing.md,
    position: "relative"
  },
  reticle: {
    position: "absolute",
    top: "50%",
    left: "50%",
    width: 220,
    height: 220,
    marginLeft: -110,
    marginTop: -110,
    borderWidth: 2,
    borderColor: colors.greenBright,
    borderRadius: radius.lg
  },
  busyOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.45)"
  },
  busyText: {color: colors.text, fontSize: 15, fontWeight: "600", fontFamily: fonts.semibold},
  hint: {color: colors.textMuted, fontSize: 12.5, textAlign: "center", marginBottom: spacing.md, fontFamily: fonts.regular},
  actions: {flexDirection: "row", gap: spacing.sm},
  action: {flex: 1},
  iosNfcNote: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center"
  },
  iosNfcText: {color: colors.textFaint, fontSize: 11.5, textAlign: "center", fontFamily: fonts.regular}
});
