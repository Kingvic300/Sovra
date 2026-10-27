import { createDAppKit } from "@mysten/dapp-kit-react";
import { registerEnokiWallets } from "@mysten/enoki";
import { SuiGrpcClient } from "@mysten/sui/grpc";

const ENOKI_API_KEY = import.meta.env.VITE_ENOKI_API_KEY;
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

/** True when this build has what zkLogin needs. Without it, only the demo account works. */
export const zkLoginConfigured = Boolean(ENOKI_API_KEY && GOOGLE_CLIENT_ID);

/** Where Google sends the sign-in popup back to. Must be listed in the Google OAuth client. */
export const AUTH_REDIRECT_PATH = "/auth/callback";

const client = new SuiGrpcClient({ network: "mainnet", baseUrl: "https://fullnode.mainnet.sui.io:443" });

export const dAppKit = createDAppKit({
  networks: ["mainnet"],
  defaultNetwork: "mainnet",
  createClient: () => client,
  // Sovra only offers zkLogin; hide the Slush browser-wallet option.
  slushWalletConfig: null,
});

if (zkLoginConfigured) {
  registerEnokiWallets({
    apiKey: ENOKI_API_KEY!,
    client,
    network: "mainnet",
    providers: {
      google: {
        clientId: GOOGLE_CLIENT_ID!,
        redirectUrl: `${window.location.origin}${AUTH_REDIRECT_PATH}`,
        // Ask Google for name and email so Sovra can greet the user.
        extraParams: { scope: "email profile" },
      },
    },
  });
}

declare module "@mysten/dapp-kit-react" {
  interface Register {
    dAppKit: typeof dAppKit;
  }
}
