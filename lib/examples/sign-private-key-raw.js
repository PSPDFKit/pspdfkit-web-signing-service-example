import fs from "fs";
import crypto from "crypto";

import * as pkijs from "pkijs";
import * as asn1js from "asn1js";

pkijs.setEngine(
  "newEngine",
  crypto,
  new pkijs.CryptoEngine({ name: "", crypto: crypto, subtle: crypto.subtle })
);

/**
 * RAW RSA signing (via Web Crypto).
 */
export default class SignPrivateKeyRaw {
  constructor(caCertificatesPaths, signerCertificatePath, privateKeyPath) {
    this.caCertificates = caCertificatesPaths;

    // Signer certificate.
    this.signerCertificatePem = fs.readFileSync(signerCertificatePath);

    // Signer private key. Must be corresponding to the signer certificate.
    this.signerPrivateKeyPem = fs.readFileSync(privateKeyPath);
  }

  /**
   * Signs the data via RSA PKCS#1 v1.5.
   *
   * @param dataToBeSigned Binary data that needs to be signed.
   * @param hashAlgorithm The hash algorithm that should be used to create the data digest.
   * @returns DER encoded RSASSA-PKCS1-v1_5 signature.
   */
  async sign(dataToBeSigned, hashAlgorithm) {
    console.log("🖊️  Signing with private key and raw signature...");

    const signAlgorithm = this.#getSignAlgorithm(hashAlgorithm);

    const importedPrivateKey = await crypto.subtle.importKey(
      "pkcs8",
      this.#convertPemToBinary(this.signerPrivateKeyPem.toString()),
      signAlgorithm,
      true,
      ["sign"]
    );

    const data = Buffer.from(dataToBeSigned, "binary");

    const signedData = await crypto.subtle.sign(signAlgorithm, importedPrivateKey, data);

    await this.verify(data, signedData, hashAlgorithm);

    // Return the signed data as DER in binary format.
    return Buffer.from(signedData);
  }

  /**
   * Verifies the data signed via the `sign` method.
   * @param {Buffer} data Binary data that was signed.
   * @param {Buffer} signedData DER encoded RSASSA-PKCS1-v1_5 signature.
   * @param {string} hashAlgorithm Hash algorith used during the singing.
   */
  async verify(data, signedData, hashAlgorithm) {
    const signAlgorithm = this.#getSignAlgorithm(hashAlgorithm);

    const asn1 = asn1js.fromBER(this.#convertPemToBinary(this.signerCertificatePem.toString()));
    const certificate = new pkijs.Certificate({ schema: asn1.result });
    const publicKey = await certificate.getPublicKey();

    const verifyResult = await crypto.subtle.verify(signAlgorithm, publicKey, signedData, data);

    console.log(`🖊️  Signed data verification result: ${verifyResult}`);
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
