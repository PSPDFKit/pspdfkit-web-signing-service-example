#!/bin/sh

set -e

OPENSSL_COMMAND="openssl"

CA_CN="Test CA for $(hostname -s) $(date +%Y)"
SIGNER_CN="Testing Document Signer for $(hostname -s)"

CA_FILENAME="test-ca"
CA_KEY_FILENAME="${CA_FILENAME}.key"
CA_CERT_FILENAME="${CA_FILENAME}.cert"

SIGNER_FILENAME="test-signer"
SIGNER_REQUEST_FILENAME="${SIGNER_FILENAME}.csr"
SIGNER_KEY_FILENAME="${SIGNER_FILENAME}.key"
SIGNER_CERT_FILENAME="${SIGNER_FILENAME}.cert"

echo "*** Preparing CA"
if test -f "${CA_KEY_FILENAME}"; then
  echo "*** CA key ('${CA_KEY_FILENAME}') already exists, skipping"
else
  ${OPENSSL_COMMAND} genrsa -out ${CA_KEY_FILENAME} 2048
  echo "*** Created CA key ('${CA_KEY_FILENAME}')."

  ${OPENSSL_COMMAND} req \
    -x509 -new -nodes -key ${CA_KEY_FILENAME} \
    -subj "/CN=${CA_CN}" \
    -days 3650 -reqexts v3_req -extensions v3_ca \
    -out ${CA_CERT_FILENAME}
  echo "*** Created CA certificate ('${CA_CERT_FILENAME}')"
fi

echo "*** Preparing signer certificate"
if test -f "${SIGNER_KEY_FILENAME}"; then
  echo "*** Signer key ('${SIGNER_KEY_FILENAME}') already exists, skipping"
else
  ${OPENSSL_COMMAND} req \
    -utf8 -nameopt oneline,utf8 -new -newkey rsa:2048 -nodes \
    -subj "/CN=${SIGNER_CN}" \
    -keyout ${SIGNER_KEY_FILENAME} -out ${SIGNER_REQUEST_FILENAME}
  echo "*** Signer certificate request created"

  ${OPENSSL_COMMAND} x509 \
    -days 365 \
    -CA ${CA_CERT_FILENAME} -CAkey ${CA_KEY_FILENAME} -CAcreateserial \
    -in ${SIGNER_REQUEST_FILENAME} -req \
    -out ${SIGNER_CERT_FILENAME}
  echo "*** Signer private key ('${CA_KEY_FILENAME}') generated"
  echo "*** Signer certificate ('${SIGNER_CERT_FILENAME}') created and signed"

  rm ${SIGNER_REQUEST_FILENAME}

fi

echo "*** Done."
