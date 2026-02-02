import os from "os";
import * as graphene from "graphene-pk11";
import forge from "node-forge";

import { execSync } from "child_process";

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
 * Returns the first private key from the session.
 */
export function getRSAPrivateKey(session) {
  const privateKeys = session.find({ class: graphene.ObjectClass.PRIVATE_KEY });

  if (privateKeys.length > 0) {
    console.log("Existing private key found in the HSM...");
    // Return the first private key.
    return privateKeys.items(0);
  } else {
    console.log("Private key could not be found in the HSM...");
    return null;
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
