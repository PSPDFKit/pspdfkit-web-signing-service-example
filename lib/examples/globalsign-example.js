import axios from "axios";
import https from "https";
import forge from "node-forge";

/**
 * Example for signing via eSigning API powered by GlobalSign (https://www.globalsign.com/en/digital-signing-service).
 *
 * Note that Document Engine needs to obtain the trusted certificate chain up to the root authority
 * that issued it when validating signatures. It will search for trusted root certificate
 * stores at the /certificate-stores path inside its container. You can mount a folder
 * from the host machine containing your certificates, or you can configure the CERTIFICATE_STORE_PATHS environment variable
 * before launching Document Engine.
 *
 * This example ships with the GlobalSign root CA in the certs directory, you need to mount this directory as
 * `/certificate-stores` inside the Document Engine container (or configure the CERTIFICATE_STORE_PATHS environment variable)
 * to validate signatures created with this method properly.
 */
export default class GlobalSignExample {
  constructor() {
    this.apiKey = get_env_or_throw("GLOBALSIGN_API_KEY");
    this.apiSecret = get_env_or_throw("GLOBALSIGN_API_SECRET");
    this.tlsCert = get_env_or_throw("GLOBALSIGN_TLS_CERT").replace(/\\n/g, "\n");
    this.tlsKey = get_env_or_throw("GLOBALSIGN_TLS_KEY").replace(/\\n/g, "\n");

    this.instance = axios.create({
      baseURL: "https://emea.api.dss.globalsign.com:8443/v2",
      headers: {
        "Content-Type": "application/json;charset=utf-8",
      },
      httpsAgent: new https.Agent({
        cert: this.tlsCert,
        key: this.tlsKey,
      }),
    });

    // An object that maps the current GlobalSign identity with The UNIX timestamp of its creation date.
    // This is to reuse identities if they haven’t expired (that is, if they are less than 10 minutes old).
    // Mutable data.
    this.currentIdentity = { id: null, signingCert: null, timestamp: null };

    // A promise that acts as a lock for safe concurrent access to the mutable shared identity cache.
    this.currentIdentityQueue = Promise.resolve();
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
    console.log("🖊️  Retrieving certificates from GlobalSign DSS...");

    const identity = await this.#generateOrReuseIdentity();
    const intermediateAndRootCAs = await this.#getIntermediateAndRootCACertificates();

    const userCertificates = [Buffer.from(identity.signingCert).toString("base64")];
    const caCertificates = intermediateAndRootCAs.map((cert) =>
      Buffer.from(cert).toString("base64")
    );

    return {
      certificates: userCertificates,
      ca_certificates: caCertificates,
    };
  }

  /**
   * Signs the data via GlobalSign DSS API.
   *
   * @param dataToBeSigned Binary data that needs to be signed.
   * @param hashAlgorithm The hash algorithm that should be used to create the data digest.
   * @returns DER encoded RSASSA-PKCS1-v1_5 signature.
   */
  async signRaw(dataToBeSigned, hashAlgorithm) {
    console.log("🖊️  Signing with GlobalSign DSS...");

    // Calculate the digest of the data we are signing before before handing it to the GlobalSign DSS API.
    // The API expects SHA-256.
    const md = forge.md.sha256.create();
    md.update(dataToBeSigned.toString("binary"));

    const identity = await this.#generateOrReuseIdentity();
    const signature = await this.#signDigest(identity.id, md.digest().toHex());
    return Buffer.from(signature, "hex");
  }

  async #currentIdentityHandler(action) {
    // Chain access and modification of identity cache.
    this.currentIdentityQueue = this.currentIdentityQueue.then(action).catch((error) => {
      // Reset the queue after a failure so later calls can rebuild the identity cache.
      this.currentIdentityQueue = Promise.resolve();
      throw error;
    });
    return this.currentIdentityQueue;
  }

  async #login() {
    const loginPayload = {
      api_key: this.apiKey,
      api_secret: this.apiSecret,
    };

    try {
      const response = await this.instance.post("/login", loginPayload);
      return response.data.access_token;
    } catch (e) {
      throw new Error(`GlobalSign login failed: ${e}`);
    }
  }

  async #generateOrReuseIdentity() {
    return this.#currentIdentityHandler(async () => {
      console.log("Generating identity in GlobalSign DSS...");

      // If this identity is less than 9 minutes old, we reuse it.
      if (this.currentIdentity.id && Date.now() - this.currentIdentity.timestamp <= 540000) {
        return {
          id: this.currentIdentity.id,
          signingCert: this.currentIdentity.signingCert,
        };
      }

      // If you have a production account with GlobalSign, you also need to pass the Common Name (CN). See the documentation
      // for the /identity endpoint to know the certificate fields that you can customize.
      const identityPayload = {
        subject_dn: {
          organizational_unit: ["Signing"],
        },
      };
      try {
        const response = await this.instance.post("/identity", identityPayload, {
          headers: { Authorization: `Bearer ${await this.#login()}` },
        });

        // Set this as the currently active identity.
        this.currentIdentity = {
          id: response.data.id,
          signingCert: response.data.signing_cert,
          timestamp: Date.now(),
        };
        return {
          id: this.currentIdentity.id,
          signingCert: this.currentIdentity.signingCert,
        };
      } catch (e) {
        throw new Error(`GlobalSign identity failed: ${JSON.stringify(e.response.data)}`);
      }
    });
  }

  async #getIntermediateAndRootCACertificates() {
    logger.info("Retrieving GlobalSign intermediate and CA chain...");
    try {
      const response = await this.instance.get("/trustchain", {
        headers: { Authorization: `Bearer ${await this.#login()}` },
      });
      logger.debug(
        `GlobalSign intermediate and root CAs retrieved successfully. Path: ${response.data.trustchain}`
      );
      return response.data.trustchain;
    } catch (e) {
      logger.error("GlobalSign trustchain failed:", e);
      throw new Error(`GlobalSign trustchain failed: ${JSON.stringify(e.response.data)}`);
    }
  }

  async #signDigest(id, digest) {
    return this.#currentIdentityHandler(async () => {
      try {
        const response = await this.instance.get(`/identity/${id}/sign/${digest}`, {
          headers: { Authorization: `Bearer ${await this.#login()}` },
        });
        return response.data.signature;
      } catch (e) {
        this.currentIdentity = { id: null, signingCert: null, timestamp: null };
        throw new Error(`GlobalSign sign failed: ${JSON.stringify(e.response.data)}`);
      }
    });
  }

  async signPkcs7(_documentContentsToSign, _hashAlgorithm) {
    throw new Error("Not implemented, use RAW signing instead of contained PKCS#7 signatures.");
  }
}

function get_env_or_throw(envName) {
  if (!process.env[envName]) {
    throw new Error(`${envName} environment variable needs to be set to use GlobalSign example.`);
  }
  return process.env[envName];
}
