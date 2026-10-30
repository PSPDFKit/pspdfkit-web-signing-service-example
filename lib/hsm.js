import os from "os";
import * as graphene from "graphene-pk11";
import forge from "node-forge";

import { execSync } from "child_process";
import { X509Certificate, createPublicKey } from "crypto";

/**
 * Initializes the HSM and returns a module object.
 */
export function initHSM() {
  const mod = graphene.Module.load(getPkcs11LibFile(), "SoftHSMv2.0");
  mod.initialize();
  return mod;
}

function getPkcs11LibFile() {
  if (process.env.HSM_MODULE) {
    return process.env.HSM_MODULE;
  } else if (os.platform() == "darwin") {
    // Use SoftHSM installed via brew on macOS.
    const brewPrefix = execSync("brew --prefix").toString().trim();
    return `${brewPrefix}/lib/softhsm/libsofthsm2.so`;
  } else {
    // Use SoftHSM in the signing service's Docker container.
    return "/usr/lib/softhsm/libsofthsm2.so";
  }
}

/**
 * Opens a session with the given slot and logs in using the user PIN stored in the environment variable.
 */
export function loginHSM(slot) {
  if (!process.env.HSM_PIN) {
    throw new Error("HSM_PIN environment variable needs to be set to use HSM examples.");
  }

  const session = slot.open(graphene.SessionFlag.SERIAL_SESSION | graphene.SessionFlag.RW_SESSION);
  session.login(process.env.HSM_PIN || "1234", graphene.UserType.User);
  return session;
}

/**
 * Logs out, closes the session and releases the module.
 *
 * A cleanup failure is raised, so a leaked handle is not left for a later request to
 * discover. The exception is when `pendingError` is set: an error thrown from a finally
 * block replaces the one already unwinding, so there it is logged instead.
 *
 * @param mod The module returned by initHSM.
 * @param session The open session, or null if one was never opened.
 * @param pendingError The error already propagating, if any.
 */
export function releaseHSM(mod, session, pendingError) {
  const failures = [];

  if (session) {
    collectFailure(failures, "log out of the HSM", () => session.logout());
    collectFailure(failures, "close the HSM session", () => session.close());
  }

  collectFailure(failures, "finalize the HSM module", () => mod.finalize());

  if (failures.length === 0) {
    return;
  }

  const message = `Failed to release the HSM: ${failures.join("; ")}`;

  if (pendingError) {
    console.error(message);
    return;
  }

  throw new Error(message);
}

function collectFailure(failures, description, action) {
  try {
    action();
  } catch (error) {
    failures.push(`could not ${description} (${error.message})`);
  }
}

/**
 * Returns the private key to sign with.
 *
 * Set HSM_KEY_LABEL or HSM_KEY_ID to name the key. The token is then searched for
 * that key and exactly one match is required, because a token holding several keys
 * gives no other way to say which one the signer certificate belongs to. With
 * neither set, the first private key on the token is used.
 */
export function getRSAPrivateKey(session) {
  const selector = keySelector();
  const privateKeys = session.find({ class: graphene.ObjectClass.PRIVATE_KEY, ...selector });

  if (Object.keys(selector).length === 0) {
    if (privateKeys.length > 0) {
      console.log("Existing private key found in the HSM...");
      return privateKeys.items(0);
    }

    console.log("Private key could not be found in the HSM...");
    return null;
  }

  if (privateKeys.length !== 1) {
    throw new Error(
      `Expected exactly one private key matching HSM_KEY_LABEL/HSM_KEY_ID, found ${privateKeys.length}.`
    );
  }

  return privateKeys.items(0);
}

function keySelector() {
  const selector = {};

  if (process.env.HSM_KEY_LABEL) {
    selector.label = process.env.HSM_KEY_LABEL;
  }

  if (process.env.HSM_KEY_ID) {
    const id = Buffer.from(process.env.HSM_KEY_ID, "hex");

    // Buffer.from silently truncates at the first character it cannot read, and a
    // zero-length CKA_ID matches keys whose id is unset rather than matching nothing.
    if (id.toString("hex") !== process.env.HSM_KEY_ID.toLowerCase()) {
      throw new Error(
        "HSM_KEY_ID must be an even number of hexadecimal digits, for example CAFED00D."
      );
    }

    selector.id = id;
  }

  return selector;
}

/**
 * Throws unless the certificate's public key is the public half of the HSM key.
 *
 * PKCS#11 exposes CKA_MODULUS and CKA_PUBLIC_EXPONENT on an RSA private key even when
 * the key is sensitive and non-extractable, so the pair can be compared without a
 * signing round trip. Signing with a key the certificate does not belong to produces a
 * container that every verifier rejects, and nothing later in the request can detect it.
 */
export function assertKeyMatchesCertificate(privateKey, certificatePem) {
  const { modulus, publicExponent } = privateKey.getAttribute({
    modulus: null,
    publicExponent: null,
  });

  const keyOnToken = createPublicKey({
    key: {
      kty: "RSA",
      n: modulus.toString("base64url"),
      e: publicExponent.toString("base64url"),
    },
    format: "jwk",
  });

  if (!keyOnToken.equals(new X509Certificate(certificatePem).publicKey)) {
    throw new Error(
      "The signer certificate does not belong to the private key selected on the HSM."
    );
  }
}

/**
 * Encodes hash digest in the conformant PKCS#1 v1.5 ASN.1 structure.
 *
 * @param {Buffer} hashDigest Hash digest.
 * @param {String} hashAlgorithm Hash algoritm used to calculate the digest.
 * @returns Buffer with the ASN.1 encoded digest.
 */
export function encodePKCS1v15(hashDigest, hashAlgorithm) {
  // get the oid for the algorithm
  const oid = forge.pki.oids[hashAlgorithm];
  const oidBytes = forge.asn1.oidToDer(oid).getBytes();

  // Create the digest info
  const digestInfo = forge.asn1.create(
    forge.asn1.Class.UNIVERSAL,
    forge.asn1.Type.SEQUENCE,
    true,
    []
  );

  const digestAlgorithm = forge.asn1.create(
    forge.asn1.Class.UNIVERSAL,
    forge.asn1.Type.SEQUENCE,
    true,
    []
  );
  digestAlgorithm.value.push(
    forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.OID, false, oidBytes)
  );
  digestAlgorithm.value.push(
    forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.NULL, false, "")
  );

  const digest = forge.asn1.create(
    forge.asn1.Class.UNIVERSAL,
    forge.asn1.Type.OCTETSTRING,
    false,
    hashDigest.toString("binary")
  );
  digestInfo.value.push(digestAlgorithm);
  digestInfo.value.push(digest);

  // Encode digest info and return it as a Buffer.
  return Buffer.from(forge.asn1.toDer(digestInfo).getBytes(), "binary");
}
