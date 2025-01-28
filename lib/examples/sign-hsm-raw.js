import * as graphene from "graphene-pk11";
import * as hsm from "../hsm.js";

import { webcrypto as crypto } from "node:crypto";

/**
 * Example of HSM signing. Uses SoftHSMv2 as a local software HSM implementation
 * and graphene-pk11 as JavaScript client for PKCS#11 protocol used by the HSM.
 */
export default class SignHsmRaw {
  constructor() {}

  /**
   * Signs the data via HSM.
   *
   * @param dataToBeSigned Binary data that needs to be signed.
   * @param hashAlgorithm The hash algorithm that should be used to create the data digest.
   * @returns DER encoded RSASSA-PKCS1-v1_5 signature.
   */
  async sign(dataToBeSigned, hashAlgorithm) {
    console.log("🖊️  Signing with HSM and raw signature...");

    // Initialize the HSM.
    const mod = hsm.initHSM();
    // Get the first slot where we store our signing key.
    const slot = mod.getSlots(0);

    // Signature result to return. `null` if we can't connect to the HSM.
    let result = null;

    // Check if the slot is initialized and a token is present in it.
    if (slot.flags & graphene.SlotFlag.TOKEN_PRESENT) {
      // Open a session.
      const session = hsm.loginHSM(slot);
      // Retrieve reference to the private key.
      const privateKey = hsm.getRSAPrivateKey(session);

      // Perform the actual signing via HSM.
      if (privateKey) {
        result = await this.#signWithHSM(session, privateKey, hashAlgorithm, dataToBeSigned);
      }

      // Logout of the HSM and close the session.
      session.logout();
      session.close();
    } else {
      console.error("Slot is not initialized");
    }
    mod.finalize();

    return result;
  }

  async #signWithHSM(session, privateKey, hashAlgorithm, dataToSign) {
    // Calculate data digest.
    const digest = session.createDigest(hashAlgorithm.toUpperCase()).once(dataToSign);

    // Create a ASN.1 sequence for the digest to indicate that the signature is a digest
    // of a previously hashed message. See https://stackoverflow.com/a/47106124
    const pkcs1Digest = hsm.encodePKCS1v15(digest, hashAlgorithm.toLowerCase());

    // Important: Since we're signing message digests (i.e. hashed messages), we need
    // to be careful to not hash it again when signing. Thus, we are using RSA_PKCS
    // instead of SHA256_RSA_PKCS here.
    let sign = session.createSign("RSA_PKCS", privateKey);
    return sign.once(pkcs1Digest);
  }
}
