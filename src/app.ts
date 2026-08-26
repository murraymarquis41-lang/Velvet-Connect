import { createClient, type User } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const APP_ENV = import.meta.env.VITE_APP_ENV === "production" ? "production" : "staging";
const ENROLLMENT_ENABLED = import.meta.env.VITE_ENABLE_ENROLLMENT === "true";

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  throw new Error("Missing required Supabase public environment configuration.");
}
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

type Profile = {
  id: string;
  display_name: string;
  bio: string | null;
  interests: string[];
  avatar_url: string | null;
  onboarding_completed: boolean;
};

const protectedPages = new Set(["profileSetupPage", "dashboardPage", "matchPage", "chatPage", "settingsPage"]);
let currentUser: User | null = null;
let discoverableProfiles: Profile[] = [];
let currentCardIndex = 0;
let activeMatchId: string | null = null;

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing required element: ${id}`);
  return found as T;
}

function setStatus(id: string, message: string, success = false): void {
  const target = element<HTMLElement>(id);
  target.textContent = message;
  target.classList.toggle("success", success);
}

function applyEnvironment(): void {
  const production = APP_ENV === "production";
  const banner = element<HTMLElement>("environmentBanner");
  const signupEntry = element<HTMLButtonElement>("signupEntryButton");
  const signupButton = element<HTMLButtonElement>("signupButton");

  banner.textContent = production
    ? ENROLLMENT_ENABLED
      ? "VELVET CONNECT · PRODUCTION"
      : "PRODUCTION VERIFICATION · ENROLLMENT PAUSED"
    : "STAGING · SYNTHETIC TEST ACCOUNTS ONLY";
  element<HTMLElement>("signupHeading").textContent = production ? "Create your account" : "Create a staging account";
  signupButton.textContent = production ? "Create Account" : "Create Staging Account";

  signupEntry.disabled = !ENROLLMENT_ENABLED;
  signupButton.disabled = !ENROLLMENT_ENABLED;
  if (!ENROLLMENT_ENABLED) {
    signupEntry.title = "Enrollment remains paused pending release-gate verification.";
    setStatus("signupStatus", "Enrollment remains paused pending release-gate verification.");
  }
}

function authRedirectUrl(): string {
  return `${window.location.origin}${window.location.pathname}`;
}

function navigateTo(pageId: string): void {
  if (protectedPages.has(pageId) && !currentUser) {
    pageId = "loginPage";
    setStatus("loginStatus", productionCopy("Sign in to access Velvet Connect.", "Sign in to access this staging feature."));
  }

  document.querySelectorAll<HTMLElement>(".page").forEach((page) => page.classList.remove("active"));
  element<HTMLElement>(pageId).classList.add("active");
  document.querySelectorAll<HTMLElement>(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.page === pageId));
  element<HTMLElement>("bottomNav").style.display = currentUser ? "flex" : "none";

  if (pageId === "dashboardPage") void loadProfileCard();
  if (pageId === "chatPage") void renderChat();
}

async function ensureProfile(user: User): Promise<Profile> {
  const { data: existing, error: readError } = await supabase
    .from("profiles")
    .select("id,display_name,bio,interests,avatar_url,onboarding_completed")
    .eq("id", user.id)
    .maybeSingle<Profile>();
  if (readError) throw readError;
  if (existing) return existing;

  const metadataName = typeof user.user_metadata.display_name === "string" ? user.user_metadata.display_name.trim() : "";
  const displayName = (metadataName || user.email?.split("@")[0] || productionCopy("Velvet member", "Staging member")).slice(0, 60);
  const { data, error } = await supabase
    .from("profiles")
    .insert({ id: user.id, display_name: displayName })
    .select("id,display_name,bio,interests,avatar_url,onboarding_completed")
    .single<Profile>();
  if (error) throw error;
  return data;
}

async function loadOwnProfile(): Promise<Profile> {
  if (!currentUser) throw new Error("Authentication required.");
  const profile = await ensureProfile(currentUser);
  element<HTMLTextAreaElement>("bio").value = profile.bio ?? "";
  element<HTMLInputElement>("interests").value = profile.interests.join(", ");
  if (profile.avatar_url) element<HTMLImageElement>("profilePreview").src = profile.avatar_url;
  return profile;
}

async function signUp(event: SubmitEvent): Promise<void> {
  event.preventDefault();
  if (!ENROLLMENT_ENABLED) {
    setStatus("signupStatus", "Enrollment remains paused pending release-gate verification.");
    return;
  }
  const button = element<HTMLButtonElement>("signupButton");
  const displayName = element<HTMLInputElement>("signupName").value.trim();
  const email = element<HTMLInputElement>("signupEmail").value.trim();
  const password = element<HTMLInputElement>("signupPassword").value;
  button.disabled = true;
  setStatus("signupStatus", "Creating account…");

  try {
    sessionStorage.setItem("velvetPendingEmail", email);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName }, emailRedirectTo: authRedirectUrl() },
    });
    if (error) throw error;
    if (data.session) {
      currentUser = data.session.user;
      await ensureProfile(currentUser);
      await loadOwnProfile();
      navigateTo("profileSetupPage");
      return;
    }
    navigateTo("verifyPage");
    setStatus("verifyStatus", productionCopy("Confirmation sent. Check your inbox.", "Confirmation sent. Check the synthetic test inbox."), true);
  } catch (error) {
    setStatus("signupStatus", error instanceof Error ? error.message : "Unable to create account.");
  } finally {
    button.disabled = false;
  }
}

async function login(event: SubmitEvent): Promise<void> {
  event.preventDefault();
  const button = element<HTMLButtonElement>("loginButton");
  button.disabled = true;
  setStatus("loginStatus", "Signing in…");
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: element<HTMLInputElement>("loginEmail").value.trim(),
      password: element<HTMLInputElement>("loginPassword").value,
    });
    if (error) throw error;
    currentUser = data.user;
    const profile = await loadOwnProfile();
    setStatus("loginStatus", "Signed in.", true);
    navigateTo(profile.onboarding_completed ? "dashboardPage" : "profileSetupPage");
  } catch (error) {
    setStatus("loginStatus", error instanceof Error ? error.message : "Unable to sign in.");
  } finally {
    button.disabled = false;
  }
}

async function resendConfirmation(): Promise<void> {
  const email = sessionStorage.getItem("velvetPendingEmail");
  if (!email) {
    setStatus("verifyStatus", productionCopy("Return to account creation and enter your email again.", "Return to account creation and enter the staging email again."));
    return;
  }
  const { error } = await supabase.auth.resend({ type: "signup", email, options: { emailRedirectTo: authRedirectUrl() } });
  setStatus("verifyStatus", error ? error.message : "Confirmation resent.", !error);
}

async function saveProfile(): Promise<void> {
  if (!currentUser) return navigateTo("loginPage");
  setStatus("profileStatus", "Saving…");
  const interests = element<HTMLInputElement>("interests").value.split(",").map((item) => item.trim()).filter(Boolean).slice(0, 12);
  const { error } = await supabase
    .from("profiles")
    .update({ bio: element<HTMLTextAreaElement>("bio").value.trim() || null, interests, onboarding_completed: true })
    .eq("id", currentUser.id);
  setStatus("profileStatus", error ? error.message : productionCopy("Profile saved to Velvet Connect.", "Profile saved to Velvet Connect Staging."), !error);
  if (!error) window.setTimeout(() => navigateTo("dashboardPage"), 500);
}

function previewProfilePhoto(event: Event): void {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.addEventListener("load", () => {
    if (typeof reader.result === "string") element<HTMLImageElement>("profilePreview").src = reader.result;
  });
  reader.readAsDataURL(file);
  setStatus("profileStatus", productionCopy("Photo preview is local only; upload is not enabled in this release slice.", "Photo preview is local only; Storage upload is not enabled in this release slice."));
}

function renderCurrentCard(): void {
  const profile = discoverableProfiles[currentCardIndex];
  if (!profile) {
    element<HTMLElement>("cardName").textContent = "No eligible profiles";
    element<HTMLElement>("cardBio").textContent = productionCopy("Discovery is restricted to eligible, onboarding-complete, unblocked accounts.", "Discovery is restricted to verified, onboarding-complete, unblocked synthetic accounts.");
    element<HTMLElement>("cardInterests").textContent = "";
    element<HTMLImageElement>("cardPhoto").removeAttribute("src");
    return;
  }
  element<HTMLElement>("cardName").textContent = profile.display_name;
  element<HTMLElement>("cardBio").textContent = profile.bio ?? "";
  element<HTMLElement>("cardInterests").textContent = profile.interests.join(" · ");
  element<HTMLImageElement>("cardPhoto").src = profile.avatar_url ?? `https://picsum.photos/seed/${encodeURIComponent(profile.id)}/500/600`;
}

async function loadProfileCard(): Promise<void> {
  if (!currentUser) return;
  setStatus("discoverStatus", productionCopy("Loading eligible profiles…", "Loading eligible staging profiles…"));
  const { data, error } = await supabase.from("profiles").select("id,display_name,bio,interests,avatar_url,onboarding_completed").neq("id", currentUser.id).limit(20);
  if (error) {
    setStatus("discoverStatus", error.message);
    return;
  }
  discoverableProfiles = (data ?? []) as Profile[];
  currentCardIndex = 0;
  renderCurrentCard();
  setStatus("discoverStatus", discoverableProfiles.length ? `${discoverableProfiles.length} eligible profile(s).` : "Verification-gated discovery is active.", true);
}

function swipeLeft(): void {
  if (!discoverableProfiles.length) return;
  currentCardIndex = (currentCardIndex + 1) % discoverableProfiles.length;
  renderCurrentCard();
}

async function swipeRight(): Promise<void> {
  const profile = discoverableProfiles[currentCardIndex];
  if (!currentUser || !profile) return;
  const { error } = await supabase.from("swipes").upsert({ actor_id: currentUser.id, target_id: profile.id, liked: true }, { onConflict: "actor_id,target_id" });
  if (error) return setStatus("discoverStatus", error.message);
  setStatus("discoverStatus", `Liked ${profile.display_name}.`, true);
  swipeLeft();
}

async function renderChat(): Promise<void> {
  const container = element<HTMLElement>("chatMessages");
  container.replaceChildren();
  if (!currentUser) return;
  const { data: matches, error } = await supabase.from("matches").select("id").order("created_at", { ascending: false }).limit(1);
  if (error || !matches?.length) {
    const message = document.createElement("p");
    message.className = "muted";
    message.textContent = error?.message ?? "No verified mutual match is available.";
    container.append(message);
    activeMatchId = null;
    return;
  }
  activeMatchId = matches[0].id as string;
  const { data: messages, error: messageError } = await supabase.from("messages").select("sender_id,body,created_at").eq("match_id", activeMatchId).order("created_at");
  if (messageError) return void (container.textContent = messageError.message);
  for (const message of messages ?? []) {
    const paragraph = document.createElement("p");
    paragraph.textContent = `${message.sender_id === currentUser.id ? "You" : "Match"}: ${message.body}`;
    container.append(paragraph);
  }
}

async function sendMessage(): Promise<void> {
  const input = element<HTMLInputElement>("chatInput");
  const body = input.value.trim();
  if (!currentUser || !activeMatchId || !body) return;
  const { error } = await supabase.from("messages").insert({ match_id: activeMatchId, sender_id: currentUser.id, body });
  if (error) return void window.alert(error.message);
  input.value = "";
  await renderChat();
}

async function logout(): Promise<void> {
  await supabase.auth.signOut();
  currentUser = null;
  navigateTo("welcomePage");
}

async function initialize(): Promise<void> {
  applyEnvironment();
  element<HTMLFormElement>("signupForm").addEventListener("submit", (event) => void signUp(event as SubmitEvent));
  element<HTMLFormElement>("loginForm").addEventListener("submit", (event) => void login(event as SubmitEvent));
  const { data } = await supabase.auth.getUser();
  currentUser = data.user;
  if (!currentUser) return navigateTo("welcomePage");
  try {
    const profile = await loadOwnProfile();
    navigateTo(profile.onboarding_completed ? "dashboardPage" : "profileSetupPage");
  } catch (error) {
    navigateTo("profileSetupPage");
    setStatus("profileStatus", error instanceof Error ? error.message : "Unable to load profile.");
  }
}

function productionCopy(productionText: string, stagingText: string): string {
  return APP_ENV === "production" ? productionText : stagingText;
}

Object.assign(window, { navigateTo, resendConfirmation, saveProfile, previewProfilePhoto, swipeLeft, swipeRight, sendMessage, logout });
void initialize();
