import GlobalTrustExample from "./examples/globaltrust-example.js";
import HsmExample from "./examples/hsm-example.js";
import PrivateKeyExample from "./examples/private-key-example.js";

export class SignMethod {
  static PrivateKey = new SignMethod("privatekey");
  static GlobalTrust = new SignMethod("globaltrust");
  static Hsm = new SignMethod("hsm");

  constructor(name) {
    this.name = name;
  }

  getSignMethodHandler() {
    switch (this.name) {
      case "globaltrust":
        console.log("Using signing method: GlobalTrust API");
        return new GlobalTrustExample();

      case "privatekey":
        console.log("Using signing method: Local Private Key");
        return new PrivateKeyExample();

      case "hsm":
        console.log("Using signing method: SoftHSM");
        return new HsmExample();

      default:
        throw new Error("Unknown signing method");
    }
  }

  static valueOf(stringValue) {
    for (const signMethodName in SignMethod) {
      const signMethod = SignMethod[signMethodName];
      if (signMethod.name == stringValue.toLowerCase()) {
        return signMethod;
      }
    }
    return null;
  }
}

export const DEFAULT_SIGN_METHOD = SignMethod.PrivateKey;
