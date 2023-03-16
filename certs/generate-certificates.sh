#!/bin/sh

set -e 

OPENSSL_COMMAND="openssl"

TEST_CA_CN="Test CA for $(hostname -s) $(date +%Y)"
TEST_SIGNER_CN="Testing Document Signer for $(hostname -s)"

${OPENSSL_COMMAND} genrsa -out test-ca.key 2048

${OPENSSL_COMMAND} req \
  -x509 -new -nodes -key test-ca.key \
  -subj "/CN=${TEST_CA_CN}" \
  -days 3650 -reqexts v3_req -extensions v3_ca \
  -out test-ca.cert

${OPENSSL_COMMAND} req \
  -utf8 -nameopt oneline,utf8 -new -newkey rsa:2048 -nodes \
  -subj "/CN=${TEST_SIGNER_CN}" \
  -keyout test-signer.key -out test-signer.csr

${OPENSSL_COMMAND} x509 \
  -days 365 \
  -CA test-ca.cert -CAkey test-ca.key -CAcreateserial \
  -in test-signer.csr -req \
  -out test-signer.cert

rm test-signer.csr
