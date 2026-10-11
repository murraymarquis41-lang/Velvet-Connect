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
const emailFor = (suffix) => `velvet-e2e-${stamp}-${suffix}@${syntheticDomain}`;

const clientOptions = { auth: { autoRefreshToken: false, persistSession: false } };
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, clientOptions);
const clients = {
  memberA: createClient(SUPABASE_URL, PUBLISHABLE_KEY, clientOptions),
  memberB: createClient(SUPABASE_URL, PUBLISHABLE_KEY, clientOptions),
  ceo: createClient(SUPABASE_URL, PUBLISHABLE_KEY, clientOptions),
  reviewer: createClient(SUPABASE_URL, PUBLISHABLE_KEY, clientOptions),
  deletion: createClient(SUPABASE_URL, PUBLISHABLE_KEY, clientOptions),
  subject: createClient(SUPABASE_URL, PUBLISHABLE_KEY, clientOptions),
  secondCeo: createClient(SUPABASE_URL, PUBLISHABLE_KEY, clientOptions),
};

const createdUserIds = [];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function seedSyntheticUser(client, suffix, displayName) {
  const email = emailFor(suffix);
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

  const consentedAt = new Date().toISOString();
  const { error: updateError } = await client.from("profiles").update({
    age: 36,
    city: "Rochester",
    bio,
    interests,
    date_of_birth: "1990-01-01",
    adult_attested_at: consentedAt,
    terms_accepted_at: consentedAt,
    onboarding_completed: true,
  }).eq("id", user.id);
  if (updateError) throw new Error(`profile onboarding failed for ${displayName}: ${updateError.message}`);
}

async function provisionSyntheticModerator(userId, role, grantedBy) {
  const { error } = await admin.from("moderator_roles").insert({
    user_id: userId,
    role,
    active: true,
    granted_by: grantedBy,
  });
  if (error) throw new Error(`${role} provisioning failed: ${error.message}`);
}

async function run() {
  console.log("E2E 1/12: deterministic staging users + authenticated sessions");
  const userA = await seedSyntheticUser(clients.memberA, "a", "E2E Member A");
  const userB = await seedSyntheticUser(clients.memberB, "b", "E2E Member B");
  const ceoUser = await seedSyntheticUser(clients.ceo, "ceo", "E2E CEO");
  const reviewerUser = await seedSyntheticUser(clients.reviewer, "reviewer", "E2E Safety Reviewer");
  const deletionUser = await seedSyntheticUser(clients.deletion, "delete", "E2E Deletion Member");

  console.log("E2E 2/12: adults-only profile enrollment and least-privilege updates");
  await createOwnProfile(clients.memberA, userA, "E2E Member A", "Synthetic release-gate profile A", ["coffee", "music", "travel"]);
  await createOwnProfile(clients.memberB, userB, "E2E Member B", "Synthetic release-gate profile B", ["music", "books", "travel"]);
  await createOwnProfile(clients.ceo, ceoUser, "E2E CEO", "Synthetic CEO profile", ["safety"]);
  await createOwnProfile(clients.reviewer, reviewerUser, "E2E Safety Reviewer", "Synthetic reviewer profile", ["safety"]);
  await createOwnProfile(clients.deletion, deletionUser, "E2E Deletion Member", "Synthetic deletion profile", ["privacy"]);

  console.log("E2E 3/12: reciprocal discovery under RLS");
  const { data: seenByA, error: discoverAError } = await clients.memberA.from("profiles").select("id").eq("id", userB.id);
  if (discoverAError) throw new Error(`A discovery query failed: ${discoverAError.message}`);
  assert(seenByA?.length === 1, "A could not discover verified/onboarded B");

  const { data: seenByB, error: discoverBError } = await clients.memberB.from("profiles").select("id").eq("id", userA.id);
  if (discoverBError) throw new Error(`B discovery query failed: ${discoverBError.message}`);
  assert(seenByB?.length === 1, "B could not discover verified/onboarded A");

  console.log("E2E 4/12: reciprocal likes create one mutual match");
  const { error: swipeAError } = await clients.memberA.from("swipes").insert({ actor_id: userA.id, target_id: userB.id, liked: true });
  if (swipeAError) throw new Error(`A like failed: ${swipeAError.message}`);
  const { error: swipeBError } = await clients.memberB.from("swipes").insert({ actor_id: userB.id, target_id: userA.id, liked: true });
  if (swipeBError) throw new Error(`B reciprocal like failed: ${swipeBError.message}`);

  const { data: matchesA, error: matchAError } = await clients.memberA.from("matches").select("id,user_a_id,user_b_id");
  if (matchAError) throw new Error(`A match read failed: ${matchAError.message}`);
  assert(matchesA?.length === 1, `expected one mutual match for A, got ${matchesA?.length ?? 0}`);
  const matchId = matchesA[0].id;

  console.log("E2E 5/12: two-way messaging");
  const { error: msgAError } = await clients.memberA.from("messages").insert({ match_id: matchId, sender_id: userA.id, body: "Synthetic hello from A" });
  if (msgAError) throw new Error(`A message failed: ${msgAError.message}`);
  const { error: msgBError } = await clients.memberB.from("messages").insert({ match_id: matchId, sender_id: userB.id, body: "Synthetic hello from B" });
  if (msgBError) throw new Error(`B message failed: ${msgBError.message}`);

  console.log("E2E 6/12: report-and-disconnect creates a private case and block");
  const { data: report, error: reportError } = await clients.memberA.from("reports").insert({
    reporter_id: userA.id,
    reported_id: userB.id,
    reason: "harassment",
    details: "Automated release-gate report. No real member involved.",
  }).select("id,status").single();
  if (reportError) throw new Error(`report creation failed: ${reportError.message}`);
  assert(report.status === "open", "new report was not open");

  const { data: reportSeenByB, error: reportBError } = await clients.memberB.from("reports").select("id").eq("id", report.id);
  if (reportBError) throw new Error(`reported member visibility query failed: ${reportBError.message}`);
  assert(reportSeenByB?.length === 0, "reported member could read reporter-private report");

  const { data: blockedMatches, error: blockedMatchError } = await clients.memberA.from("matches").select("id").eq("id", matchId);
  if (blockedMatchError) throw new Error(`post-report match query failed: ${blockedMatchError.message}`);
  assert(blockedMatches?.length === 0, "report-and-disconnect left the match readable");

  const { error: blockedMessageError } = await clients.memberB.from("messages").insert({
    match_id: matchId,
    sender_id: userB.id,
    body: "This message must be rejected after report-and-disconnect",
  });
  assert(Boolean(blockedMessageError), "message was incorrectly accepted after report-and-disconnect");

  console.log("E2E 7/12: synthetic CEO and independent reviewer provisioning");
  await provisionSyntheticModerator(ceoUser.id, "ceo", ceoUser.id);
  await provisionSyntheticModerator(reviewerUser.id, "safety_admin", ceoUser.id);

  const { data: cases, error: caseError } = await clients.ceo.from("moderation_cases").select("id,status,reported_id").eq("report_id", report.id);
  if (caseError) throw new Error(`CEO moderation queue read failed: ${caseError.message}`);
  assert(cases?.length === 1, "report did not create exactly one moderation case");
  const caseId = cases[0].id;

  console.log("E2E 8/12: unauthorized moderation is rejected");
  const { error: unauthorizedModerationError } = await clients.memberA.rpc("moderate_case", {
    target_case_id: caseId,
    requested_action: "claimed",
    action_reason: "Unauthorized synthetic attempt",
    suspension_hours: 72,
  });
  assert(Boolean(unauthorizedModerationError), "ordinary member was able to moderate a case");

  console.log("E2E 9/12: CEO moderation, role boundaries, and temporary suspension");
  const { error: claimError } = await clients.ceo.rpc("moderate_case", {
    target_case_id: caseId,
    requested_action: "claimed",
    action_reason: "Synthetic CEO claimed the case",
    suspension_hours: 72,
  });
  if (claimError) throw new Error(`CEO case claim failed: ${claimError.message}`);

  const { error: safetyAdminPermanentError } = await clients.reviewer.rpc("moderate_case", {
    target_case_id: caseId,
    requested_action: "permanently_suspended",
    action_reason: "This unauthorized permanent action must fail",
    suspension_hours: 72,
  });
  assert(Boolean(safetyAdminPermanentError), "safety administrator performed a CEO-only permanent action");

  const { error: suspendError } = await clients.ceo.rpc("moderate_case", {
    target_case_id: caseId,
    requested_action: "temporarily_suspended",
    action_reason: "Synthetic temporary suspension for QA",
    suspension_hours: 1,
  });
  if (suspendError) throw new Error(`temporary suspension failed: ${suspendError.message}`);

  console.log("E2E 10/12: appeal requires an independent reviewer");
  const { data: appealId, error: appealError } = await clients.memberB.rpc("submit_moderation_appeal", {
    target_case_id: caseId,
    appeal_statement: "This is a synthetic appeal statement for the Build 03 release gate.",
  });
  if (appealError) throw new Error(`appeal submission failed: ${appealError.message}`);
  assert(Boolean(appealId), "appeal submission returned no appeal ID");

  const { error: selfReviewError } = await clients.ceo.rpc("review_moderation_appeal", {
    target_appeal_id: appealId,
    decision: "overturned",
    decision_reason: "Original assignee must not review this appeal",
  });
  assert(Boolean(selfReviewError), "original case assignee was able to review the appeal");

  // Compatibility baseline: new issue17 deployments require an explicit
  // independent claim. Only a missing legacy RPC may use the older baseline.
  // Complete issue17 proof is always the separate fail-closed live suite.
  const { error: claimAppealError } = await clients.reviewer.rpc("claim_moderation_appeal", { target_appeal_id: appealId });
  if (claimAppealError && claimAppealError.code !== "PGRST202") throw new Error("independent appeal claim failed");
  console.log(claimAppealError ? "Legacy staging baseline; issue17 full flow remains untested" : "Independent appeal claim succeeded");
  const { error: independentReviewError } = await clients.reviewer.rpc("review_moderation_appeal", {
    target_appeal_id: appealId,
    decision: "overturned",
    decision_reason: "Independent synthetic review completed",
  });
  if (independentReviewError) throw new Error(`independent appeal review failed: ${independentReviewError.message}`);

  const { data: restoredProfile, error: restoredError } = await admin.from("profiles").select("safety_status").eq("id", userB.id).single();
  if (restoredError) throw new Error(`restored profile verification failed: ${restoredError.message}`);
  assert(restoredProfile.safety_status === "active", "overturned appeal did not reactivate the member");

  console.log("E2E 11/12: moderation audit is immutable");
  const { data: actions, error: actionsError } = await clients.ceo.from("moderation_actions").select("id,action").eq("case_id", caseId);
  if (actionsError) throw new Error(`moderation action read failed: ${actionsError.message}`);
  assert(actions?.length >= 4, `expected at least four audit actions, got ${actions?.length ?? 0}`);
  const { error: immutableError } = await admin.from("moderation_actions").update({ reason: "Mutation must fail" }).eq("id", actions[0].id);
  assert(Boolean(immutableError), "moderation audit entry was mutable");

  console.log("E2E 12/12: typed-confirmation account deletion");
  const { data: deleteResult, error: deleteError } = await clients.deletion.rpc("delete_own_account", { confirmation: "DELETE" });
  if (deleteError) throw new Error(`self-service deletion failed: ${deleteError.message}`);
  assert(deleteResult === true, "self-service deletion did not return success");
  const deletionIndex = createdUserIds.indexOf(deletionUser.id);
  if (deletionIndex >= 0) createdUserIds.splice(deletionIndex, 1);

  const { data: deletedUserData, error: deletedUserError } = await admin.auth.admin.getUserById(deletionUser.id);
  assert(Boolean(deletedUserError) || !deletedUserData?.user, "deleted Auth identity still exists");
  const { data: deletedProfiles, error: deletedProfileError } = await admin.from("profiles").select("id").eq("id", deletionUser.id);
  if (deletedProfileError) throw new Error(`deleted profile verification failed: ${deletedProfileError.message}`);
  assert(deletedProfiles?.length === 0, "deleted account retained a profile row");

  console.log("E2E 13: open moderation case holds account deletion");
  const subjectUser = await seedSyntheticUser(clients.subject, "subject", "E2E Permanent Subject");
  const secondCeoUser = await seedSyntheticUser(clients.secondCeo, "ceo2", "E2E Second CEO");
  await createOwnProfile(clients.subject, subjectUser, "E2E Permanent Subject", "Synthetic permanent-action subject", ["safety"]);
  await createOwnProfile(clients.secondCeo, secondCeoUser, "E2E Second CEO", "Synthetic second CEO profile", ["safety"]);
  await provisionSyntheticModerator(secondCeoUser.id, "ceo", ceoUser.id);

  const { data: heldReport, error: heldReportError } = await clients.memberA.from("reports").insert({
    reporter_id: userA.id,
    reported_id: subjectUser.id,
    reason: "harassment",
    details: "Synthetic permanent-suspension report. No real member involved.",
  }).select("id,reason,details").single();
  if (heldReportError) throw new Error(`permanent-subject report failed: ${heldReportError.message}`);

  const { error: heldDeletionError } = await clients.subject.rpc("delete_own_account", { confirmation: "DELETE" });
  assert(Boolean(heldDeletionError), "subject deleted an account while a moderation case was open");

  console.log("E2E 14: safety admin cannot overturn a CEO permanent suspension");
  const { data: permanentCases, error: permanentCaseError } = await clients.ceo.from("moderation_cases").select("id").eq("report_id", heldReport.id);
  if (permanentCaseError) throw new Error(`permanent case lookup failed: ${permanentCaseError.message}`);
  assert(permanentCases?.length === 1, "permanent-subject report did not create one case");
  const permanentCaseId = permanentCases[0].id;

  const { error: permanentError } = await clients.ceo.rpc("moderate_case", {
    target_case_id: permanentCaseId,
    requested_action: "permanently_suspended",
    action_reason: "Synthetic CEO permanent suspension",
    suspension_hours: 72,
  });
  if (permanentError) throw new Error(`CEO permanent suspension failed: ${permanentError.message}`);

  const { error: suspendedDeletionError } = await clients.subject.rpc("delete_own_account", { confirmation: "DELETE" });
  assert(Boolean(suspendedDeletionError), "permanently suspended subject deleted the account");

  const { data: permanentAppealId, error: permanentAppealError } = await clients.subject.rpc("submit_moderation_appeal", {
    target_case_id: permanentCaseId,
    appeal_statement: "Synthetic appeal of a CEO permanent suspension.",
  });
  if (permanentAppealError) throw new Error(`permanent appeal submission failed: ${permanentAppealError.message}`);
  assert(Boolean(permanentAppealId), "permanent appeal submission returned no appeal ID");

  const { error: safetyOverturnError } = await clients.reviewer.rpc("review_moderation_appeal", {
    target_appeal_id: permanentAppealId,
    decision: "overturned",
    decision_reason: "Safety admin must not reverse a CEO permanent suspension",
  });
  assert(Boolean(safetyOverturnError), "safety administrator overturned a CEO permanent suspension");

  const { data: stillSuspended, error: stillSuspendedError } = await admin.from("profiles").select("safety_status").eq("id", subjectUser.id).single();
  if (stillSuspendedError) throw new Error(`permanent status check failed: ${stillSuspendedError.message}`);
  assert(stillSuspended.safety_status === "permanently_suspended", "failed safety-admin overturn changed the suspension");

  console.log("E2E 15: a different CEO overturns the permanent suspension");
  const { error: ceoOverturnError } = await clients.secondCeo.rpc("review_moderation_appeal", {
    target_appeal_id: permanentAppealId,
    decision: "overturned",
    decision_reason: "Second CEO reversed the permanent suspension",
  });
  if (ceoOverturnError) throw new Error(`second CEO overturn failed: ${ceoOverturnError.message}`);

  const { data: restoredSubject, error: restoredSubjectError } = await admin.from("profiles").select("safety_status").eq("id", subjectUser.id).single();
  if (restoredSubjectError) throw new Error(`restored permanent subject check failed: ${restoredSubjectError.message}`);
  assert(restoredSubject.safety_status === "active", "CEO overturn did not reactivate the permanently suspended member");

  const { data: overturnActions, error: overturnActionsError } = await admin.from("moderation_actions").select("action").eq("case_id", permanentCaseId).eq("action", "appeal_overturned");
  if (overturnActionsError) throw new Error(`permanent appeal audit read failed: ${overturnActionsError.message}`);
  assert(overturnActions?.length === 1, "CEO overturn did not write appeal_overturned");

  console.log("E2E 16: deletion after closure preserves the allegation");
  const { data: preservedDeleteResult, error: preservedDeleteError } = await clients.subject.rpc("delete_own_account", { confirmation: "DELETE" });
  if (preservedDeleteError) throw new Error(`closed-case deletion failed: ${preservedDeleteError.message}`);
  assert(preservedDeleteResult === true, "closed-case deletion did not return success");
  const subjectIndex = createdUserIds.indexOf(subjectUser.id);
  if (subjectIndex >= 0) createdUserIds.splice(subjectIndex, 1);

  const { data: preservedReport, error: preservedReportError } = await admin.from("reports").select("id,reason,details,reported_id").eq("id", heldReport.id).single();
  if (preservedReportError) throw new Error(`preserved report read failed: ${preservedReportError.message}`);
  assert(preservedReport.reason === heldReport.reason, "deletion removed the report reason");
  assert(preservedReport.details === heldReport.details, "deletion removed the report details");
  assert(preservedReport.reported_id === null, "deletion did not detach the deleted subject from the report");

  console.log("AUTHENTICATED BUILD 03 SYNTHETIC E2E PASS");
}

let runFailure = null;
try {
  await run();
} catch (error) {
  runFailure = error;
}

const cleanupFailures = [];
for (const id of createdUserIds.reverse()) {
  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) cleanupFailures.push(error.message);
}
await Promise.all(Object.values(clients).map((client) => client.auth.signOut()));

if (cleanupFailures.length > 0) {
  throw new Error(`synthetic cleanup failed for ${cleanupFailures.length} account(s)`);
}
if (runFailure) throw runFailure;
console.log("SYNTHETIC CLEANUP PASS");

