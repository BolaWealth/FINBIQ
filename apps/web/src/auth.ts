import { createAuthClient } from "better-auth/react";
import { twoFactorClient } from "better-auth/client/plugins";

const API = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

export const authClient = createAuthClient({
  baseURL: `${API}/api/auth`,
  plugins: [twoFactorClient()],
});

export const { useSession } = authClient;
