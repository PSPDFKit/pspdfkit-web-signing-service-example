import * as fs from "fs";

import SignPrivateKeyPkcs7 from "./sign-private-key-pkcs7.js";
import SignPrivateKeyRaw from "./sign-private-key-raw.js";

// Certificates of Certificate Authorities (CA) that form a certificate
// chain from the root CA to the signer certificate.
//
// Full certificate chain needs to be embedded in the signature to validate properly.
//
// Nutrient Document Engine needs to obtain the trusted certificate chain up to the root authority
// that issued it when validating signatures. It will search for trusted root certificate
// stores at the /certificate-stores path inside its container. You can mount a folder
// from the host machine containing your certificates.
const caCertificatePaths = ["./certs/test-ca.cert"];

// Path to our signer certificate.
const signerCertificatePath = "./certs/test-signer.cert";
const signerCertificatePem = fs.readFileSync(signerCertificatePath);

// Path to our signer private key that corresponds to the signer certificate.
const signerPrivateKeyPath = "./certs/test-signer.key";

/**
 * Example of signing using a local private key.
 */
export default class PrivateKeyExample {
  constructor() {}

  /**
   * Returns the full certificate chain for the signature, needs to include
   * signer certificate as well as any CA in the certificate chain.
   *
   * Used only for RAW RSA signing (see signRaw() function above).
   *
   * @return Certificates in PEM format.
   */
  async getCertificates() {
    console.log("🖊️  Retrieving certificates...");

    const base64CACerts = caCertificatePaths.map((file) => {
      const certPem = fs.readFileSync(file);
      return certPem.toString("base64");
    });

    return {
      certificates: [signerCertificatePem.toString("base64")],
      ca_certificates: base64CACerts,
    };
  }

  async signRaw(dataToBeSigned, hashAlgorithm) {
    return new SignPrivateKeyRaw(
      caCertificatePaths,
      signerCertificatePath,
      signerPrivateKeyPath
    ).sign(dataToBeSigned, hashAlgorithm);
  }

  async signPkcs7(documentContentsToSign, hashAlgorithm) {
    return new SignPrivateKeyPkcs7(
      caCertificatePaths,
      signerCertificatePath,
      signerPrivateKeyPath
    ).sign(documentContentsToSign, hashAlgorithm);
  }
}
