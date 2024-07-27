import fs from "fs";
import forge from "node-forge";

/**
 * PKCS#7 signing (via node-forge).
 *
 * @param documentContents Binary contents of the document to be signed.
 * @returns DER encoded PKCS#7 container with document signature.
 */
export default class SignPrivateKeyPKCS7 {
  constructor(caCertificatesPaths, signerCertificatePath, privateKeyPath) {
    this.caCertificates = caCertificatesPaths;

    // Signer certificate.
    this.signerCertificatePem = fs.readFileSync(signerCertificatePath);
    this.signerCertificate = forge.pki.certificateFromPem(this.signerCertificatePem);

    // Signer private key. Must be corresponding to the signer certificate.
    this.signerPrivateKeyPem = fs.readFileSync(privateKeyPath);
    this.signerPrivateKey = forge.pki.privateKeyFromPem(this.signerPrivateKeyPem);
  }

  /**
   * Signs the data via node-forge and produces PKCS#7 container.
   *
   * @param documentContents Binary contents of the document to be signed.
   * @returns DER encoded PKCS#7 container with document signature.
   */
  async sign(documentContents, _hashAlgorithm) {
    console.log("🖊️  Signing with private key and PKCS#7 container...");

    let p7 = forge.pkcs7.createSignedData();
    p7.content = new forge.util.ByteBuffer(documentContents);

    // Add signer's CA certificates.
    this.caCertificates
      .map((file) => {
        const certPem = fs.readFileSync(file);
        return forge.pki.certificateFromPem(certPem);
      })
      .forEach((caCertificate) => {
        p7.addCertificate(caCertificate);
      });

    // Add signer certificate.
    p7.addCertificate(this.signerCertificate);

    // Add signer with a pair of private key and it's associated certificate.
    p7.addSigner({
      key: this.signerPrivateKey,
      certificate: this.signerCertificate,
      digestAlgorithm: forge.pki.oids.sha256,
      // See section 5.3 at https://tools.ietf.org/html/rfc2985#page-12 for
      // a list of allowed attributes
      authenticatedAttributes: [
        {
          type: forge.pki.oids.contentType,
          value: forge.pki.oids.data,
        },
        {
          type: forge.pki.oids.messageDigest,
        },
        {
          type: forge.pki.oids.signingTime,
          value: new Date(),
        },
      ],
    });

    p7.sign({ detached: true });

    // Return the PKCS#7 container with the signature as DER in binary format.
    return Buffer.from(forge.asn1.toDer(p7.toAsn1()).getBytes(), "binary");
  }
}
