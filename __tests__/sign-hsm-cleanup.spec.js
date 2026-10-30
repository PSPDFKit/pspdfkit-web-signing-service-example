import { jest } from "@jest/globals";
import * as graphene from "graphene-pk11";

// The signing paths hold a PKCS#11 session and an initialized module across the
// certificate and key-selection checks, so a throw from either has to unwind both. A
// leaked module leaves the next request unable to initialize.
const session = { logout: jest.fn(), close: jest.fn() };
const mod = {
  getSlots: () => ({ flags: graphene.SlotFlag.TOKEN_PRESENT }),
  finalize: jest.fn(),
};

// Stands in for the real helper, whose raise-or-log rule is covered directly in
// hsm.spec.js. Here the subject is the signing paths: whether they release both handles,
// and which error the caller ends up with.
jest.unstable_mockModule("../lib/hsm.js", () => ({
  initHSM: () => mod,
  loginHSM: () => session,
  getRSAPrivateKey: () => ({}),
  assertKeyMatchesCertificate: () => {
    throw new Error("The signer certificate does not belong to the private key.");
  },
  releaseHSM: (openModule, openSession) => {
    if (openSession) {
      try {
        openSession.logout();
      } catch {
        // The real helper decides whether to raise this.
      }
      openSession.close();
    }
    openModule.finalize();
  },
  encodePKCS1v15: () => Buffer.alloc(0),
}));

const { default: SignHsmRaw } = await import("../lib/examples/sign-hsm-raw.js");
const { default: SignHsmPkcs7 } = await import("../lib/examples/sign-hsm-pkcs7.js");
const { readFileSync } = await import("fs");

const signerCertificatePem = readFileSync(new URL("../certs/test-signer.cert", import.meta.url));

describe.each([
  ["SignHsmRaw", () => new SignHsmRaw(signerCertificatePem)],
  ["SignHsmPkcs7", () => new SignHsmPkcs7([], signerCertificatePem)],
])("%s when a check rejects the key", (_name, build) => {
  beforeEach(() => {
    session.logout.mockReset();
    session.close.mockReset();
    mod.finalize.mockReset();
  });

  test("releases the session and the module", async () => {
    await expect(build().sign(Buffer.from("payload"), "sha256")).rejects.toThrow(
      "does not belong to the private key"
    );

    expect(session.logout).toHaveBeenCalled();
    expect(session.close).toHaveBeenCalled();
    expect(mod.finalize).toHaveBeenCalled();
  });

  test("keeps the signing error when teardown also fails", async () => {
    session.logout.mockImplementation(() => {
      throw new Error("CKR_DEVICE_ERROR");
    });

    await expect(build().sign(Buffer.from("payload"), "sha256")).rejects.toThrow(
      "does not belong to the private key"
    );

    expect(session.close).toHaveBeenCalled();
    expect(mod.finalize).toHaveBeenCalled();
  });
});
