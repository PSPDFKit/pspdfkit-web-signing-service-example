import fs from "fs";
import * as graphene from "graphene-pk11";
import forge from "node-forge";

import * as hsm from "../hsm.js";

/**
 * Example of HSM signing. Uses SoftHSMv2 as a local software HSM implementation
 * and graphene-pk11 as JavaScript client for PKCS#11 protocol used by the HSM.
 */
export default class SignHsmPkcs7 {
  constructor(caCertificatesPaths, signerCertificatePath) {
    this.caCertificates = caCertificatesPaths;

    // Signer certificate.
    this.signerCertificatePem = fs.readFileSync(signerCertificatePath);
    this.signerCertificate = forge.pki.certificateFromPem(this.signerCertificatePem);
  }

  /**
   * Signs the data via HSM and uses node-forge to produce PKCS#7 container.
   *
   * @param documentContents Binary contents of the document to be signed.
   * @returns DER encoded PKCS#7 container with document signature.
   */
  async sign(documentContents, _hashAlgorithm) {
    console.log("🖊️  Signing with HSM and PKCS#7 container...");

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

      const signerFn = this.#getSignerFn(session, privateKey);

      // Create PKCS#7 container of signature + certificate
      const p7 = this.#createPKCS7Signature(documentContents, this.signerCertificate, signerFn);
      // Convert the PKCS#7 to a Base64-encoded string for sending it over the network.
      result = Buffer.from(forge.asn1.toDer(p7.toAsn1()).getBytes(), "binary");

      // Logout of the HSM and close the session.
      session.logout();
      session.close();
    } else {
      console.error("Slot is not initialized");
    }
    mod.finalize();

    return result;
  }

  #createPKCS7Signature(documentContents, cert, signerFn) {
    const p7 = forge.pkcs7.createSignedData();

    p7.content = new forge.util.ByteBuffer(documentContents);
    p7.addCertificate(cert);
    p7.addSigner({
      key: signerFn,
      certificate: cert,
      // this bit is important, you must choose a supported algorithm by the key vault
      // sha1 is not supported, for example.
      digestAlgorithm: forge.pki.oids.sha256,
      authenticatedAttributes: [
        {
          type: forge.pki.oids.contentType,
          value: forge.pki.oids.data,
        },
        {
          type: forge.pki.oids.messageDigest,
          // value will be auto-populated at signing time
        },
        {
          type: forge.pki.oids.signingTime,
          value: new Date(),
        },
      ],
    });

    p7.sign({ detached: true });

    return p7;
  }

  #getSignerFn(session, privateKey) {
    // Add custom signer function that will communicate with the HSM to sign inside of it.
    // https://github.com/digitalbazaar/forge/issues/861
    // This is used instead of passing a proper private key to `node-forge`, since we don't have
    // any, due to the private key being contained in the HSM and not accessible outside of it.
    return {
      sign: (md) => {
        // Create the PKCS#1 v1.5 message digest.
        const digest = hsm.encodePKCS1v15(Buffer.from(md.digest().toHex(), "hex"), md.algorithm);

        // Important: Since we're signing message digests (i.e. hashed messages), we need
        // to be careful to not hash it again when signing. Thus, we are using RSA_PKCS
        // instead of SHA256_RSA_PKCS here.
        let sign = session.createSign("RSA_PKCS", privateKey);
        return sign.once(digest).toString("binary");
      },
    };
  }
}
