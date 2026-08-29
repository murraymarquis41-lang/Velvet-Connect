import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || "https://qqintbwoalvoegvqoxlo.supabase.co";
const PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || "sb_publishable_HuzOX6mv9QBruN_8Ct3n6Q_CFNrt4pe";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY is required as an encrypted GitHub Actions secret for synthetic verification and cleanup.");
}

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const password = `VcE2E-${stamp}-A9!`;
const syntheticDomain = "qqintbwoalvoegvqoxlo.supabase.co";
const emailA = `velvet-e2e-${stamp}-a@${syntheticDomain}`;
const emailB = `velvet-e2e-${stamp}-b@${syntheticDomain}`;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const clientA = createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const clientB = createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const createdUserIds = [];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function seedSyntheticUser(client, email, displayName) {
  // The service-role harness creates and confirms disposable staging users so
  // this release gate is deterministic and independent of outbound-email quotas.
  // The public client must still authenticate each account and all application
  // operations below continue to run through normal member sessions under RLS.
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: displayName, synthetic_e2e: true },
  });
  if (error) throw new Error(`synthetic user seed failed for ${displayName}: ${error.message}`);
  assert(data.user?.id, `synthetic seed did not return a user for ${displayName}`);
  createdUserIds.push(data.user.id);

  const { data: loginData, error: loginError } = await client.auth.signInWithPassword({ email, password });
  if (loginError) throw new Error(`login failed for ${displayName}: ${loginError.message}`);
  assert(loginData.user?.id === data.user.id, `login identity mismatch for ${displayName}`);
  return loginData.user;
}

async function createOwnProfile(client, user, displayName, bio, interests) {
  const { error: insertError } = await client.from("profiles").insert({
    id: user.id,
    display_name: displayName,
  });
  if (insertError) throw new Error(`profile creation failed for ${displayName}: ${insertError.message}`);

  const { error: verifyError } = await admin.from("profiles").update({ verified: true }).eq("id", user.id);
  if (verifyError) throw new Error(`staging verification failed for ${displayName}: ${verifyError.message}`);

  const { error: updateError } = await client.from("profiles").update({
    bio,
    interests,
    onboarding_completed: true,
  }).eq("id", user.id);
  if (updateError) throw new Error(`profile onboarding failed for ${displayName}: ${updateError.message}`);
}

async function run() {
  console.log("E2E 1/8: deterministic staging seed + public-client login");
  const userA = await seedSyntheticUser(clientA, emailA, "E2E Member A");
  const userB = await seedSyntheticUser(clientB, emailB, "E2E Member B");

  console.log("E2E 2/8: profile creation + synthetic staging verification + onboarding");
  await createOwnProfile(clientA, userA, "E2E Member A", "Synthetic release-gate profile A", ["coffee", "music", "travel"]);
  await createOwnProfile(clientB, userB, "E2E Member B", "Synthetic release-gate profile B", ["music", "books", "travel"]);

  console.log("E2E 3/8: reciprocal discovery under RLS");
  const { data: seenByA, error: discoverAError } = await clientA.from("profiles").select("id,display_name").eq("id", userB.id);
  if (discoverAError) throw new Error(`A discovery query failed: ${discoverAError.message}`);
  assert(seenByA?.length === 1, "A could not discover verified/onboarded B");

  const { data: seenByB, error: discoverBError } = await clientB.from("profiles").select("id,display_name").eq("id", userA.id);
  if (discoverBError) throw new Error(`B discovery query failed: ${discoverBError.message}`);
  assert(seenByB?.length === 1, "B could not discover verified/onboarded A");

  console.log("E2E 4/8: reciprocal likes -> automatic match");
  const { error: swipeAError } = await clientA.from("swipes").insert({ actor_id: userA.id, target_id: userB.id, liked: true });
  if (swipeAError) throw new Error(`A like failed: ${swipeAError.message}`);
  const { error: swipeBError } = await clientB.from("swipes").insert({ actor_id: userB.id, target_id: userA.id, liked: true });
  if (swipeBError) throw new Error(`B reciprocal like failed: ${swipeBError.message}`);

  const { data: matchesA, error: matchAError } = await clientA.from("matches").select("id,user_a_id,user_b_id");
  if (matchAError) throw new Error(`A match read failed: ${matchAError.message}`);
  assert(matchesA?.length === 1, `expected one mutual match for A, got ${matchesA?.length ?? 0}`);
  const matchId = matchesA[0].id;

  const { data: matchesB, error: matchBError } = await clientB.from("matches").select("id").eq("id", matchId);
  if (matchBError) throw new Error(`B match read failed: ${matchBError.message}`);
  assert(matchesB?.length === 1, "B could not read the same mutual match");

  console.log("E2E 5/8: two-way messaging");
  const { error: msgAError } = await clientA.from("messages").insert({ match_id: matchId, sender_id: userA.id, body: "Synthetic hello from A" });
  if (msgAError) throw new Error(`A message failed: ${msgAError.message}`);
  const { error: msgBError } = await clientB.from("messages").insert({ match_id: matchId, sender_id: userB.id, body: "Synthetic hello from B" });
  if (msgBError) throw new Error(`B message failed: ${msgBError.message}`);

  const { data: messagesForA, error: messagesAError } = await clientA.from("messages").select("sender_id,body").eq("match_id", matchId).order("created_at");
  if (messagesAError) throw new Error(`A message read failed: ${messagesAError.message}`);
  assert(messagesForA?.length === 2, `A expected two messages, got ${messagesForA?.length ?? 0}`);

  console.log("E2E 6/8: report creation + reporter-only visibility");
  const { data: report, error: reportError } = await clientA.from("reports").insert({
    reporter_id: userA.id,
    reported_id: userB.id,
    reason: "Synthetic safety test",
    details: "Automated release-gate report. No real member involved.",
  }).select("id,status").single();
  if (reportError) throw new Error(`report creation failed: ${reportError.message}`);
  assert(report.status === "open", "new report was not open");

  const { data: reportSeenByB, error: reportBError } = await clientB.from("reports").select("id").eq("id", report.id);
  if (reportBError) throw new Error(`reported member visibility query failed: ${reportBError.message}`);
  assert(reportSeenByB?.length === 0, "reported member could read reporter-private report");

  console.log("E2E 7/8: blocking severs discovery/match/message access");
  const { error: blockError } = await clientA.from("blocks").insert({ blocker_id: userA.id, blocked_id: userB.id });
  if (blockError) throw new Error(`block creation failed: ${blockError.message}`);

  const { data: blockedDiscovery, error: blockedDiscoveryError } = await clientA.from("profiles").select("id").eq("id", userB.id);
  if (blockedDiscoveryError) throw new Error(`post-block discovery query failed: ${blockedDiscoveryError.message}`);
  assert(blockedDiscovery?.length === 0, "blocked member remained discoverable");

  const { data: blockedMatches, error: blockedMatchError } = await clientA.from("matches").select("id").eq("id", matchId);
  if (blockedMatchError) throw new Error(`post-block match query failed: ${blockedMatchError.message}`);
  assert(blockedMatches?.length === 0, "blocked match remained readable");

  const { error: blockedMessageError } = await clientB.from("messages").insert({
    match_id: matchId,
    sender_id: userB.id,
    body: "This message must be rejected after block",
  });
  assert(Boolean(blockedMessageError), "message was incorrectly accepted after block");

  console.log("E2E 8/8: release-gate assertions complete");
  console.log("AUTHENTICATED SYNTHETIC E2E PASS");
}

try {
  await run();
} finally {
  for (const id of createdUserIds.reverse()) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) console.error(`cleanup warning for synthetic user ${id}: ${error.message}`);
  }
  await clientA.auth.signOut();
  await clientB.auth.signOut();
}
