import { createClient } from "@supabase/supabase-js";
import { collectMetrics, evaluateHealth } from "./issue17-purge-health-lib.mjs";

const target = "https://qqintbwoalvoegvqoxlo.supabase.co";
if (process.env.SUPABASE_URL !== target || process.env.ISSUE17_HOSTED_APPROVED !== "true") {
  throw new Error("Verified staging identity and separate hosted approval are required.");
}
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("Encrypted staging service credential required.");
const client = createClient(target, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const report = evaluateHealth(await collectMetrics(client));
console.log(JSON.stringify(report));
if (report.result !== "PASS") process.exitCode = 1;
