import { createClient } from "@supabase/supabase-js";
import { purgeEvidence } from "./issue17-purge-lib.mjs";

const target = "https://qqintbwoalvoegvqoxlo.supabase.co";
if (process.env.SUPABASE_URL !== target || process.env.ISSUE17_HOSTED_APPROVED !== "true") {
  throw new Error("Verified staging identity and separate hosted approval are required.");
}
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("Encrypted staging service credential required.");
const client = createClient(target, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
console.log(JSON.stringify(await purgeEvidence(client)));
