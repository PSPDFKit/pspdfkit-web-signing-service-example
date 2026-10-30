import forge from "node-forge";

export default function createAuthenticatedAttributes() {
  // node-forge preserves caller order instead of sorting SET OF values by
  // complete DER encoding as required by X.690 section 11.6.
  return [
    {
      type: forge.pki.oids.contentType,
      value: forge.pki.oids.data,
    },
    {
      type: forge.pki.oids.signingTime,
      value: new Date(),
    },
    {
      type: forge.pki.oids.messageDigest,
    },
  ];
}
