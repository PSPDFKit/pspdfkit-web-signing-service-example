import fs from "fs";
import forge from "node-forge";
import { webcrypto as crypto } from "node:crypto";

/**
 * RAW RSA signing (via Web Crypto).
 */
export default class SignPrivateKeyRaw {
  constructor(caCertificatesPaths, signerCertificatePath, privateKeyPath) {
    console.log("🖊️  Signing with private key and raw signature...");

    this.caCertificates = caCertificatesPaths;

    // Signer certificate.
    this.signerCertificatePem = fs.readFileSync(signerCertificatePath);
    this.signerCertificate = forge.pki.certificateFromPem(this.signerCertificatePem);

    // Signer private key. Must be corresponding to the signer certificate.
    this.signerPrivateKeyPem = fs.readFileSync(privateKeyPath);
    this.signerPrivateKey = forge.pki.privateKeyFromPem(this.signerPrivateKeyPem);
  }

  /**
   * Signs the data via RSA PKCS#1 v1.5.
   *
   * @param dataToBeSigned Binary data that needs to be signed.
   * @param hashAlgorithm The hash algorithm that was used to create the document digest.
   * @returns DER encoded RSASSA-PKCS1-v1_5 signature.
   */
  async sign(dataToBeSigned, hashAlgorithm) {
    const signAlgorithm = this.#getSignAlgorithm(hashAlgorithm);

    const importedPrivateKey = await crypto.subtle.importKey(
      "pkcs8",
      this.#convertPemToBinary(this.signerPrivateKeyPem.toString()),
      signAlgorithm,
      true,
      ["sign"]
    );

    const signedData = await crypto.subtle.sign(
      signAlgorithm,
      importedPrivateKey,
      Buffer.from(dataToBeSigned, "binary")
    );

    // Return the signed data as DER in binary format.
    return Buffer.from(signedData, "binary");
  }

  /**
   * Normalizes the hash algorithm to constants used by Web Crypto.
   */
  #getHashAlgorithm(hashAlgorithm) {
    switch (hashAlgorithm.toLowerCase()) {
      case "sha256":
        return "SHA-256";
      case "sha384":
        return "SHA-384";
      case "sha512":
        return "SHA-512";
      default:
        throw new Error(`Unsupported hash algorithm ${hashAlgorithm}`);
    }
  }

  /**
   * Factory for Web Crypto's signing algorithm.
   */
  #getSignAlgorithm(hashAlgorithm) {
    // RSA PKCS#1 v1.5
    return {
      name: "RSASSA-PKCS1-v1_5",
      hash: {
        name: this.#getHashAlgorithm(hashAlgorithm),
      },
      modulusLength: 2048,
      extractable: false,
      publicExponent: new Uint8Array([1, 0, 1]),
    };
  }

  /**
   * Converts PEM certificate to Base64 encoded binary.
   *
   * @param pem PEM encoded certificate.
   * @returns Base64 encoded certificate in DER format.
   */
  #convertPemToBinary(pem) {
    const lines = pem.split("\n");
    let encoded = "";

    for (let i = 0; i < lines.length; i++) {
      if (
        lines[i].trim().length > 0 &&
        lines[i].indexOf("-BEGIN RSA PRIVATE KEY-") < 0 &&
        lines[i].indexOf("-BEGIN PRIVATE KEY-") < 0 &&
        lines[i].indexOf("-BEGIN RSA PUBLIC KEY-") < 0 &&
        lines[i].indexOf("-BEGIN CERTIFICATE-") < 0 &&
        lines[i].indexOf("-END RSA PRIVATE KEY-") < 0 &&
        lines[i].indexOf("-END PRIVATE KEY-") < 0 &&
        lines[i].indexOf("-END RSA PUBLIC KEY-") < 0 &&
        lines[i].indexOf("-END CERTIFICATE-") < 0
      ) {
        encoded += lines[i].trim();
      }
    }

    return Buffer.from(encoded, "base64");
  }
}
