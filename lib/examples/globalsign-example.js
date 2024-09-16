import axios from "axios";
import https from "https";
import fs from "fs";
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
    this.tlsCert = get_env_or_throw("GLOBALSIGN_TLS_CERT");
    this.tlsKey = get_env_or_throw("GLOBALSIGN_TLS_KEY");

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
    // Cached Bearer token to authenticate the calls to all API endpoints. Mutable data.
    this.accessToken = null;

    // A promise that acts as a lock for safe concurrent access to the mutable shared access token.
    this.accessTokenQueue = Promise.resolve();

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

    const identity = await this.#generateIdentity();
    const issuer = await this.#getSigningCertificateIssuer();

    const userCertificates = [Buffer.from(identity.signing_cert).toString("base64")];
    const caCertificates = [Buffer.from(issuer).toString("base64")];

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

    const signature = await this.#signDigest(this.currentIdentity.id, md.digest().toHex());
    return Buffer.from(signature, "hex");
  }

  async #accessTokenHandler(action) {
    // Chain access and modification of the access token.
    this.accessTokenQueue = this.accessTokenQueue.then(action);
    return this.accessTokenQueue;
  }

  async #currentIdentityHandler(action) {
    // Chain access and modification of identity cache.
    this.currentIdentityQueue = this.currentIdentityQueue.then(action);
    return this.currentIdentityQueue;
  }

  async #login() {
    return this.#accessTokenHandler(async () => {
      // First see if we have a cached API Bearer token.
      if (this.accessToken) {
        return this.accessToken;
      }

      const loginPayload = {
        api_key: this.apiKey,
        api_secret: this.apiSecret,
      };

      try {
        const response = await this.instance.post("/login", loginPayload);
        // Cache the Bearer access token to use it in our endpoint calls.
        this.accessToken = response.data.access_token;
        return this.accessToken;
      } catch (e) {
        throw new Error(`GlobalSign login failed: ${e}`);
      }
    });
  }

  async #generateIdentity() {
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
        return { id: this.currentIdentity.id, signing_cert: this.currentIdentity.signingCert };
      } catch (e) {
        throw new Error(`GlobalSign identity failed: ${JSON.stringify(e.response.data)}`);
      }
    });
  }

  async #getSigningCertificateIssuer() {
    try {
      const response = await this.instance.get("/certificate_path", {
        headers: { Authorization: `Bearer ${await this.#login()}` },
      });
      return response.data.path;
    } catch (e) {
      throw new Error(`GlobalSign certificate_path failed: ${JSON.stringify(e.response.data)}`);
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

function setup_axios_interceptor(instance) {
  instance.interceptors.request.use(
    (x) => {
      console.log(x);
      return x;
    },
    function (error) {
      return Promise.reject(error);
    }
  );

  instance.interceptors.response.use(
    (x) => {
      console.log(x);
      return x;
    },
    function (error) {
      return Promise.reject(error);
    }
  );
}
