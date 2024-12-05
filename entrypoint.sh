#!/bin/sh

set -euo pipefail

: ${SIGNING_SERVICE_PORT:=6000}
export SIGNING_SERVICE_PORT

: ${T2GO_USER-}
export T2GO_USER
: ${T2GO_PASSWORD:-}
export T2GO_PASSWORD
: ${GLOBALSIGN_API_KEY-}
export GLOBALSIGN_API_KEY
: ${GLOBALSIGN_API_SECRET-}
export GLOBALSIGN_API_SECRET
: ${GLOBALSIGN_TLS_CERT-}
export GLOBALSIGN_TLS_CERT
: ${GLOBALSIGN_TLS_KEY-}
export GLOBALSIGN_TLS_KEY

: ${HSM_PIN:='1234'}
export HSM_PIN
: ${HSM_MODULE:='/usr/lib/softhsm/libsofthsm2.so'}
export HSM_MODULE

# Delete any previously imported test key.
if softhsm2-util --show-slots | grep "test-key"; then
  softhsm2-util --delete-token --token test-key
fi

# Initialize the token with name test-key in the first free slot in the HSM.
# For example purposes, we are setting the PIN to 1234 and Security Officer pin to 0000.
softhsm2-util --init-token --free --label test-key --pin 1234 --so-pin 0000

# Import the test signer key in the created slot.
softhsm2-util --import certs/test-signer.key --token test-key --label test-key --id CAFED00D --pin 1234

# Start the app.
node "index.js"
