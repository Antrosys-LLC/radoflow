import { describe, expect, it } from "vitest";
import { createServerClient } from "@supabase/ssr";
import { webcrypto } from "node:crypto";

import type { Database } from "@/lib/supabase/database.types";

/**
 * The session no longer asks the auth server who the caller is.
 *
 * `loadSession` and the middleware both used to call `getUser()`, which is an
 * HTTP round trip to Supabase — about 600ms from Pakistan, twice per page, on
 * every navigation. Both now call `getClaims()`, which verifies the access
 * token's signature in-process against the project's published JWKS.
 *
 * That is only a safe trade if the verification is real. These tests pin the
 * property the swap depends on: a token signed by the project's key is
 * accepted and yields the claims the session is built from, and a token whose
 * payload has been edited is refused. If `getClaims()` ever stopped checking
 * the signature, the app would accept any cookie a browser cared to invent —
 * so this must fail loudly rather than quietly.
 *
 * A throwaway key pair stands in for the project's own, supplied through the
 * documented `jwks` option, so the test needs no network and no credentials.
 */

const encoder = new TextEncoder();

const b64url = (bytes: Uint8Array) =>
  Buffer.from(bytes).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const b64urlJson = (value: unknown) => b64url(encoder.encode(JSON.stringify(value)));

async function signedToken(claims: Record<string, unknown>) {
  const { publicKey, privateKey } = await webcrypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );

  const jwk = (await webcrypto.subtle.exportKey("jwk", publicKey)) as JsonWebKey;
  const kid = "test-key";

  const signingInput = `${b64urlJson({ alg: "ES256", typ: "JWT", kid })}.${b64urlJson(claims)}`;

  const signature = await webcrypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    privateKey,
    encoder.encode(signingInput),
  );

  return {
    token: `${signingInput}.${b64url(new Uint8Array(signature))}`,
    /*
     * `kty` is optional on the DOM's JsonWebKey but required on Supabase's JWK,
     * so it is restated rather than spread. WebCrypto always sets it for an
     * exported EC key; the fallback only satisfies the type.
     */
    jwks: {
      keys: [
        {
          ...jwk,
          kty: jwk.kty ?? "EC",
          alg: "ES256",
          kid,
          key_ops: ["verify"],
          use: "sig",
        },
      ],
    },
  };
}

/** A server client with no cookies; every token under test is passed explicitly. */
function client() {
  return createServerClient<Database>("https://project.supabase.co", "anon-key", {
    cookies: { getAll: () => [], setAll: () => {} },
  });
}

function baseClaims(overrides: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1000);
  return {
    sub: "11111111-1111-1111-1111-111111111111",
    iss: "https://project.supabase.co/auth/v1",
    aud: "authenticated",
    role: "authenticated",
    iat: now,
    exp: now + 3600,
    session_id: "22222222-2222-2222-2222-222222222222",
    ...overrides,
  };
}

describe("getClaims as the replacement for getUser", () => {
  it("accepts a properly signed token and exposes the claims the session needs", async () => {
    const issuedAt = Math.floor(Date.now() / 1000) - 60;
    const { token, jwks } = await signedToken(baseClaims({ iat: issuedAt }));

    const { data, error } = await client().auth.getClaims(token, { jwks });

    expect(error).toBeNull();
    // `sub` becomes session.userId; `iat` decides whether a role change has
    // outrun the token. Both are read straight off this payload now.
    expect(data?.claims.sub).toBe("11111111-1111-1111-1111-111111111111");
    expect(data?.claims.iat).toBe(issuedAt);
  });

  it("refuses a token whose payload was edited after signing", async () => {
    const { token, jwks } = await signedToken(baseClaims());

    // Promote the caller to a different user, leaving the signature untouched:
    // exactly what a forged session cookie would look like.
    const [header, , signature] = token.split(".");
    const forged = [
      header,
      b64urlJson(baseClaims({ sub: "99999999-9999-9999-9999-999999999999" })),
      signature,
    ].join(".");

    const { data, error } = await client().auth.getClaims(forged, { jwks });

    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });

  it("refuses a token signed by a key the project does not publish", async () => {
    const { token } = await signedToken(baseClaims());
    // A different key pair entirely — an attacker signing their own tokens.
    const { jwks: strangerJwks } = await signedToken(baseClaims());

    const { data, error } = await client().auth.getClaims(token, { jwks: strangerJwks });

    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });

  it("refuses an expired token", async () => {
    const past = Math.floor(Date.now() / 1000) - 7200;
    const { token, jwks } = await signedToken(baseClaims({ iat: past, exp: past + 3600 }));

    const { data, error } = await client().auth.getClaims(token, { jwks });

    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });
});
