import axios from "axios";
import forge from "node-forge";

const BASE_URL = "https://t2g.globaltrust.eu/trust2go";

/**
 * Example for signing via eSigning API powered by GlobalTrust (Trust2Go, https://globaltrust.eu/en/trust2go/).
 *
 * Note that Document Engine needs to obtain the trusted certificate chain up to the root authority
 * that issued it when validating signatures. It will search for trusted root certificate
 * stores at the /certificate-stores path inside its container. You can mount a folder
 * from the host machine containing your certificates.
 *
 * This example ships with the GlobalTrust root CA in the certs directory, you need to mount this directory as
 * `/certificate-stores` inside the Document Engine container to validate  signatures created with this method properly.
 */
export default class GlobalTrustExample {
  constructor() {
    this.apiUser = get_env_or_throw("T2GO_USER");
    this.apiPassword = get_env_or_throw("T2GO_PASSWORD");
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
    console.log("🖊️  Retrieving certificates from GlobalTrust (Trust2Go)...");

    const certificates = await this.#listCertificates();

    // Extract the certificates from the API response.
    const userCertificates = [];
    const caCertificates = [];

    for (const certificate of certificates) {
      // User certificate is used for signing.
      if (certificate.level === "USER") {
        // Document Engine expects certificates in Base64 encoded PEM format.
        userCertificates.push(Buffer.from(certificate.certificateString).toString("base64"));
      } else {
        // Provide rest of certificates to Document Engine as CA certificates, because
        // full certificate chain needs to be embedded in the signature to validate properly.
        caCertificates.push(Buffer.from(certificate.certificateString).toString("base64"));
      }
    }

    return {
      certificates: userCertificates,
      ca_certificates: caCertificates,
    };
  }

  /**
   * Signs the data via GlobalTrust (Trust2Go) API.
   *
   * @param dataToBeSigned Binary data that needs to be signed.
   * @param hashAlgorithm The hash algorithm that should be used to create the data digest.
   * @returns DER encoded RSASSA-PKCS1-v1_5 signature.
   */
  async signRaw(dataToBeSigned, hashAlgorithm) {
    console.log("🖊️  Signing with GlobalTrust (Trust2Go)...");

    // Calculate the digest of the data we are signing before before handing it to the GlobalTrust API.
    const md = this.#getHashAlgorithm(hashAlgorithm).create();
    md.update(dataToBeSigned.toString("binary"));
    const digest = Buffer.from(md.digest().toHex(), "hex");

    const signPayload = {
      language: "en",
      // Trust2Go requires this ID is 6 characters long. It’s used for matching requests and responses.
      requestId: "123456",
      // Fetch the certificates from the GlobalTrust API to retrieve the signer certificate serial.
      certificateSerialNumber: await this.#getSignerCertificateSerialNumber(),
      // Data digest that we need to sign, in Base64 format
      hashes: [digest.toString("base64")],
      // Hash algorithm used to produce the digest.
      hashAlgorithm: hashAlgorithm.toLowerCase(),
    };

    console.log("Signing payload: ", signPayload);

    try {
      const response = await axios.post(`${BASE_URL}/api/signers/usernames/sign`, signPayload, {
        auth: {
          username: this.apiUser,
          password: this.apiPassword,
        },
      });

      // GlobalTrust API responds with signed hash encoded as Base64, return it as DER in binary format.
      return Buffer.from(response.data.signedHashes[0].signedHash, "base64");
    } catch (e) {
      throw new Error(`GlobalTrust signing failed: ${JSON.stringify(e.response.data)}`);
    }
  }

  async #listCertificates() {
    try {
      const response = await axios.get(
        `${BASE_URL}/api/v1/signers/usernames/certificates?language=en`,
        {
          auth: {
            username: this.apiUser,
            password: this.apiPassword,
          },
        }
      );

      // Extract the certificates from the API response.
      return response.data[0];
    } catch (e) {
      throw new Error(`GlobalTrust get certificates failed: ${JSON.stringify(e.response.data)}`);
    }
  }

  async #getSignerCertificateSerialNumber() {
    // Retrieve the certificates to get the signing certificate serial number.
    const certificates = await this.#listCertificates();

    for (const certificate of certificates) {
      if (certificate.level === "USER") {
        return certificate.certificateSerialNumber;
      }
    }

    throw new Error("Could not retrieve certificate serial number.");
  }

  #getHashAlgorithm(hashAlgorithm) {
    switch (hashAlgorithm.toLowerCase()) {
      case "sha256":
        return forge.md.sha256;
      case "sha384":
        return forge.md.sha384;
      case "sha512":
        return forge.md.sha512;
      default:
        throw new Error(`Unsupported hash algorithm ${hashAlgorithm}`);
    }
  }

  async signPkcs7(_documentContentsToSign, _hashAlgorithm) {
    throw new Error("Not implemented, use RAW signing instead of contained PKCS#7 signatures.");
  }
}

function get_env_or_throw(envName) {
  if (!process.env[envName]) {
    throw new Error(`${envName} environment variable needs to be set to use GlobalTrust example.`);
  }
  return process.env[envName];
}

function setup_axios_interceptor() {
  axios.interceptors.request.use(
    function (config) {
      console.log(config);
      return config;
    },
    function (error) {
      return Promise.reject(error);
    }
  );
}
