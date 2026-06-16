import {describe, expect, it} from "vitest";
import {ACCESS_TTL_SECONDS, signAccessToken, verifyAccessToken} from "./access-token";

describe("access-token — QR a rotazione (HMAC-SHA256)", () => {
  it("sign/verify round-trip → {ticketId}; tre segmenti; TTL di default", () => {
    const token = signAccessToken("tkt_1");
    expect(token.split(".")).toHaveLength(3);
    expect(verifyAccessToken(token)).toEqual({ticketId: "tkt_1"});
    expect(ACCESS_TTL_SECONDS).toBe(30);
  });

  it("rifiuta token manomessi → BAD_TOKEN", () => {
    const token = signAccessToken("tkt_1");
    const [head, body, sig] = token.split(".");
    // payload alterato (altro ticketId), firma originale → mismatch
    const forgedBody = Buffer.from(
      JSON.stringify({ticketId: "tkt_999", iat: 1, exp: 9999999999})
    ).toString("base64url");
    expect(() => verifyAccessToken(`${head}.${forgedBody}.${sig}`)).toThrowError(/firma/);
    // firma corrotta
    let err: unknown;
    try {
      verifyAccessToken(`${head}.${body}.${sig}x`);
    } catch (e) {
      err = e;
    }
    expect((err as {code: string}).code).toBe("BAD_TOKEN");
    // formato errato / mancante
    expect(() => verifyAccessToken("non-un-token")).toThrowError(/malformato/);
    expect(() => verifyAccessToken(undefined)).toThrowError(/mancante/);
  });

  it("rifiuta token scaduti → TOKEN_EXPIRED (ttl negativo)", () => {
    const expired = signAccessToken("tkt_1", -10); // exp già nel passato
    let err: unknown;
    try {
      verifyAccessToken(expired);
    } catch (e) {
      err = e;
    }
    expect((err as {code: string; status: number}).code).toBe("TOKEN_EXPIRED");
    expect((err as {status: number}).status).toBe(401);
  });

  it("ttl 0 → scade immediatamente (nowSeconds >= exp)", () => {
    const token = signAccessToken("tkt_1", 0);
    expect(() => verifyAccessToken(token)).toThrowError(/scaduto/);
  });
});
