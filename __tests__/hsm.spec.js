import { jest } from "@jest/globals";
import fs from "fs";
import path from "path";
import { X509Certificate } from "crypto";
import { fileURLToPath } from "url";

import * as graphene from "graphene-pk11";

import { assertKeyMatchesCertificate, releaseHSM, getRSAPrivateKey } from "../lib/hsm.js";
import HsmExample from "../lib/examples/hsm-example.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const certificatePath = (name) => path.resolve(__dirname, `../certs/${name}`);
const signerCertificate = fs.readFileSync(certificatePath("test-signer.cert"));
const caCertificate = fs.readFileSync(certificatePath("test-ca.cert"));

// Stands in for a token holding the key that certificate was issued for. A PKCS#11
// token may report either attribute with leading zero padding, so the padding is
// applied here rather than assumed away.
const keyReporting = (certificatePem, { padded = false } = {}) => {
  const jwk = new X509Certificate(certificatePem).publicKey.export({ format: "jwk" });
  const pad = (bytes) => (padded ? Buffer.concat([Buffer.alloc(1), bytes]) : bytes);

  return {
    requestedTemplate: null,
    getAttribute(template) {
      this.requestedTemplate = template;
      return {
        modulus: pad(Buffer.from(jwk.n, "base64url")),
        publicExponent: pad(Buffer.from(jwk.e, "base64url")),
      };
    },
  };
};

const sessionReturning = (keys) => ({
  templates: [],
  find(template) {
    this.templates.push(template);
    return { length: keys.length, items: (index) => keys[index] };
  },
});

describe("assertKeyMatchesCertificate", () => {
  test("accepts the certificate issued for the key", () => {
    expect(() =>
      assertKeyMatchesCertificate(keyReporting(signerCertificate), signerCertificate)
    ).not.toThrow();
  });

  test("accepts attributes the token reports with leading zero padding", () => {
    expect(() =>
      assertKeyMatchesCertificate(
        keyReporting(signerCertificate, { padded: true }),
        signerCertificate
      )
    ).not.toThrow();
  });

  test("rejects a certificate issued for a different key", () => {
    expect(() =>
      assertKeyMatchesCertificate(keyReporting(caCertificate), signerCertificate)
    ).toThrow("does not belong to the private key");
  });

  test("asks the token for the public key attributes", () => {
    const key = keyReporting(signerCertificate);
    assertKeyMatchesCertificate(key, signerCertificate);

    expect(key.requestedTemplate).toEqual({ modulus: null, publicExponent: null });
  });
});

describe("getRSAPrivateKey", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.HSM_KEY_LABEL;
    delete process.env.HSM_KEY_ID;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  test("returns the first key when no selector is configured", () => {
    const session = sessionReturning(["first", "second"]);

    expect(getRSAPrivateKey(session)).toBe("first");
    expect(session.templates).toEqual([{ class: graphene.ObjectClass.PRIVATE_KEY }]);
  });

  test("returns null when the token holds no private key", () => {
    expect(getRSAPrivateKey(sessionReturning([]))).toBeNull();
  });

  test("searches the token for a configured label and id", () => {
    process.env.HSM_KEY_LABEL = "signing-key";
    process.env.HSM_KEY_ID = "cafed00d";
    const session = sessionReturning(["only"]);

    expect(getRSAPrivateKey(session)).toBe("only");
    expect(session.templates).toEqual([
      {
        class: graphene.ObjectClass.PRIVATE_KEY,
        label: "signing-key",
        id: Buffer.from("cafed00d", "hex"),
      },
    ]);
  });

  test("refuses to guess when a selector matches several keys", () => {
    process.env.HSM_KEY_LABEL = "signing-key";

    expect(() => getRSAPrivateKey(sessionReturning(["one", "two"]))).toThrow(
      "Expected exactly one private key matching HSM_KEY_LABEL/HSM_KEY_ID, found 2."
    );
  });

  test("fails when a selector matches nothing", () => {
    process.env.HSM_KEY_LABEL = "signing-key";

    expect(() => getRSAPrivateKey(sessionReturning([]))).toThrow("found 0");
  });

  test.each(["not-hex", "cafed00"])("rejects the key id %p", (id) => {
    process.env.HSM_KEY_ID = id;

    expect(() => getRSAPrivateKey(sessionReturning(["only"]))).toThrow("hexadecimal digits");
  });

  test("treats an empty key id as no selector at all", () => {
    process.env.HSM_KEY_ID = "";
    const session = sessionReturning(["first"]);

    expect(getRSAPrivateKey(session)).toBe("first");
    expect(session.templates).toEqual([{ class: graphene.ObjectClass.PRIVATE_KEY }]);
  });
});

describe("HsmExample certificates", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.HSM_SIGNER_CERTIFICATE;
    delete process.env.HSM_CA_CERTIFICATES;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  test("returns the test certificates when nothing is configured", async () => {
    const certificates = await new HsmExample().getCertificates();

    expect(certificates.certificates).toEqual([signerCertificate.toString("base64")]);
    expect(certificates.ca_certificates).toEqual([caCertificate.toString("base64")]);
  });

  test("returns no chain when a signer certificate is configured without one", async () => {
    process.env.HSM_SIGNER_CERTIFICATE = certificatePath("test-ca.cert");

    expect((await new HsmExample().getCertificates()).ca_certificates).toEqual([]);
  });

  test("reads the configured signer certificate and chain", async () => {
    process.env.HSM_SIGNER_CERTIFICATE = certificatePath("test-ca.cert");
    process.env.HSM_CA_CERTIFICATES = ` ${certificatePath("test-ca.cert")} , `;

    const certificates = await new HsmExample().getCertificates();

    expect(certificates.certificates).toEqual([caCertificate.toString("base64")]);
    expect(certificates.ca_certificates).toEqual([caCertificate.toString("base64")]);
  });
});

describe("releaseHSM", () => {
  let logged;

  beforeEach(() => {
    logged = [];
    jest.spyOn(console, "error").mockImplementation((message) => logged.push(message));
  });

  afterEach(() => {
    console.error.mockRestore();
  });

  const throwing = (message) => () => {
    throw new Error(message);
  };

  test("releases both handles when nothing fails", () => {
    const session = { logout: jest.fn(), close: jest.fn() };
    const mod = { finalize: jest.fn() };

    expect(() => releaseHSM(mod, session, null)).not.toThrow();
    expect(session.close).toHaveBeenCalled();
    expect(mod.finalize).toHaveBeenCalled();
  });

  test("raises a cleanup failure when signing succeeded", () => {
    const session = { logout: jest.fn(), close: throwing("CKR_DEVICE_ERROR") };
    const mod = { finalize: jest.fn() };

    expect(() => releaseHSM(mod, session, null)).toThrow("CKR_DEVICE_ERROR");
    expect(mod.finalize).toHaveBeenCalled();
  });

  test("only logs a cleanup failure when an error is already unwinding", () => {
    const session = { logout: throwing("CKR_DEVICE_ERROR"), close: jest.fn() };
    const mod = { finalize: jest.fn() };

    expect(() => releaseHSM(mod, session, new Error("signing failed"))).not.toThrow();
    expect(logged.join(" ")).toContain("CKR_DEVICE_ERROR");
    expect(session.close).toHaveBeenCalled();
    expect(mod.finalize).toHaveBeenCalled();
  });

  test("reports every failure, not just the first", () => {
    const session = { logout: throwing("logout boom"), close: throwing("close boom") };
    const mod = { finalize: throwing("finalize boom") };

    expect(() => releaseHSM(mod, session, null)).toThrow(/logout boom.*close boom.*finalize boom/);
  });

  test("finalizes the module when no session was opened", () => {
    const mod = { finalize: jest.fn() };

    expect(() => releaseHSM(mod, null, null)).not.toThrow();
    expect(mod.finalize).toHaveBeenCalled();
  });
});
