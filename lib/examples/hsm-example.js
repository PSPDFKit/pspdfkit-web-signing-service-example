import * as fs from "fs";

import SignHsmRaw from "./sign-hsm-raw.js";
import SignHsmPkcs7 from "./sign-hsm-pkcs7.js";

// Certificates of Certificate Authorities (CA) that form a certificate
// chain from the root CA to the signer certificate.
//
// Full certificate chain needs to be embedded in the signature to validate properly.
//
// Nutrient Document Engine needs to obtain the trusted certificate chain up to the root authority
// that issued it when validating signatures. It will search for trusted root certificate
// stores at the /certificate-stores path inside its container. You can mount a folder
// from the host machine containing your certificates.
const defaultCaCertificatePaths = ["./certs/test-ca.cert"];

// Path to our signer certificate.
const defaultSignerCertificatePath = "./certs/test-signer.cert";

/**
 * Example of HSM signing. Uses SoftHSMv2 as a local software HSM implementation
 * and graphene-pk11 as JavaScript client for PKCS#11 protocol used by the HSM.
 *
 * Set HSM_SIGNER_CERTIFICATE and HSM_CA_CERTIFICATES (comma separated) to sign with
 * a key held on another HSM, whose certificate is not the one generated for SoftHSM.
 */
export default class HsmExample {
  constructor() {
    const signerCertificatePath =
      process.env.HSM_SIGNER_CERTIFICATE || defaultSignerCertificatePath;

    this.signerCertificatePem = fs.readFileSync(signerCertificatePath);

    if (process.env.HSM_CA_CERTIFICATES) {
      this.caCertificatePaths = process.env.HSM_CA_CERTIFICATES.split(",")
        .map((path) => path.trim())
        .filter((path) => path.length > 0);
    } else {
      // The test chain belongs to the test signer, so it is only a sensible default
      // while the signer certificate is also the default one.
      this.caCertificatePaths = process.env.HSM_SIGNER_CERTIFICATE ? [] : defaultCaCertificatePaths;
    }
  }

  /**
   * Returns the full certificate chain for the signature, needs to include
   * signer certificate as well as any CA in the certificate chain.
   *
   * Used only for RAW RSA signing (see signRaw() function above).
   *
   * @return Certificates in PEM format.
   */
  async getCertificates() {
    console.log("🖊️  Retrieving certificates for HSM...");

    const base64CACerts = this.caCertificatePaths.map((file) => {
      const certPem = fs.readFileSync(file);
      return certPem.toString("base64");
    });

    return {
      certificates: [this.signerCertificatePem.toString("base64")],
      ca_certificates: base64CACerts,
    };
  }

  async signRaw(dataToBeSigned, hashAlgorithm) {
    return new SignHsmRaw(this.signerCertificatePem).sign(dataToBeSigned, hashAlgorithm);
  }

  async signPkcs7(documentContentsToSign, hashAlgorithm) {
    return new SignHsmPkcs7(this.caCertificatePaths, this.signerCertificatePem).sign(
      documentContentsToSign,
      hashAlgorithm
    );
  }
}
