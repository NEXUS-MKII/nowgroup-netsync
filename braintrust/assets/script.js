/* ═══════════════════════════════════════════════════════════════════
   NOW Brain Trust — Survey Wizard
   Loads a per-member manifest, walks through prospects with 5 questions
   each, submits answers per-prospect for graceful resumption.
   ═══════════════════════════════════════════════════════════════════ */

const CONFIG = {
    // Manifest fetch pattern — matches nexus_brain_trust_selector.py output
    // When deployed on GitHub Pages: these should live at the same origin.
    manifestPattern: "./sessions/{member_id}_{session_id}.json",
    // Submit endpoint — swap for your Google Apps Script / Formspree / Flask webhook
    submitEndpoint: "https://webhooks.nowgroup.co.nz/forms/braintrust",
    fallbackEmail: "chris@nowgroup.co.nz",
};

// ── STATE ──────────────────────────────────────────────────────────
const state = {
    memberId: null,
    sessionId: null,
    manifest: null,
    prospectIndex: 0,
    currentAnswer: {},   // for the in-flight prospect
    responses: [],       // completed responses
    step: "loading",
};

// ── DOM ─────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const stepMap = {
    loading:  $("loading-step"),
    error:    $("error-step"),
    welcome:  $("welcome-step"),
    prospect: $("prospect-step"),
    done:     $("done-step"),
};

function showStep(name) {
    Object.values(stepMap).forEach(el => { el.hidden = true; el.classList.remove("active"); });
    if (stepMap[name]) { stepMap[name].hidden = false; stepMap[name].classList.add("active"); }
    state.step = name;
    window.scrollTo({ top: 0, behavior: "smooth" });
}

function updateProgress() {
    const total = state.manifest?.prospects?.length || 1;
    const done = state.responses.length + (state.step === "done" ? 0 : 0);
    const pad = (n) => String(n).padStart(2, "0");
    $("current").textContent = pad(Math.min(done + 1, total));
    $("total").textContent = pad(total);
    $("progressBar").style.width = `${Math.min(100, (done / total) * 100)}%`;
}

// ── URL PARAMS ─────────────────────────────────────────────────────
function readParams() {
    const params = new URLSearchParams(window.location.search);
    state.memberId  = params.get("m");
    state.sessionId = params.get("s");
}

// ── MANIFEST FETCH ─────────────────────────────────────────────────
async function loadManifest() {
    if (!state.memberId || !state.sessionId) {
        showError("Missing session parameters", "The link you used doesn't include member or session info. Double-check the URL or reply to the email that sent you here.");
        return;
    }
    const url = CONFIG.manifestPattern
        .replace("{member_id}", state.memberId)
        .replace("{session_id}", state.sessionId);
    try {
        const r = await fetch(url);
        if (!r.ok) throw new Error(`Manifest fetch ${r.status}`);
        state.manifest = await r.json();
        if (!state.manifest.prospects || !state.manifest.prospects.length) {
            showError("No prospects to review", "Your session manifest is empty. Reply to the email that sent you here and we'll fix it.");
            return;
        }
        renderWelcome();
    } catch (e) {
        // Inline fallback if the manifest was baked into the page as window.MANIFEST
        if (window.MANIFEST) {
            state.manifest = window.MANIFEST;
            renderWelcome();
            return;
        }
        showError("Session not found", `We couldn't load your prospects list. (${e.message})`);
    }
}

function showError(title, body) {
    $("errorTitle").textContent = title;
    $("errorBody").textContent = body;
    showStep("error");
}

// ── WELCOME ────────────────────────────────────────────────────────
function renderWelcome() {
    $("memberName").textContent = state.manifest.member_name || state.memberId;
    $("welcomeCount").textContent = state.manifest.prospects.length;
    showStep("welcome");
    updateProgress();
}

$("startBtn")?.addEventListener("click", () => {
    state.prospectIndex = 0;
    renderProspect();
});

// ── PROSPECT RENDER ────────────────────────────────────────────────
function currentProspect() {
    return state.manifest.prospects[state.prospectIndex];
}

function renderProspect() {
    const p = currentProspect();
    if (!p) return finishSession();

    $("pAvatar").textContent = (p.name || "?").split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
    $("pName").textContent = p.name || p.id;
    $("pRole").textContent = [p.role, p.company].filter(Boolean).join(" · ") || "—";
    const loc = [p.city, p.country].filter(Boolean).join(", ");
    $("pLocation").textContent = loc;

    const meta = $("pMeta");
    meta.innerHTML = "";
    if (p.chris_linkedin_connected) {
        const chip = document.createElement("span");
        chip.className = "chip linked";
        chip.textContent = "You share a LinkedIn connection with Chris";
        meta.appendChild(chip);
    }
    if (p.archetype) {
        const chip = document.createElement("span");
        chip.className = "chip";
        chip.textContent = p.archetype.replace(/_/g, " ");
        meta.appendChild(chip);
    }

    // Reset Q state
    state.currentAnswer = { prospect_id: p.id, prospect_name: p.name, answered_at: new Date().toISOString() };
    document.querySelectorAll(".choice-btn.selected").forEach(el => el.classList.remove("selected"));
    ["q1", "q2", "q3", "q4", "q5"].forEach((id, i) => { $(id).hidden = i > 0; });
    updateProgress();
    showStep("prospect");
}

// ── ANSWER CAPTURE ─────────────────────────────────────────────────
document.addEventListener("click", (e) => {
    const btn = e.target.closest(".choice-btn");
    if (!btn || state.step !== "prospect") return;

    const answerKind = btn.dataset.answer;
    const q = btn.dataset.q;
    const v = btn.dataset.v;

    if (answerKind === "know_no") {
        state.currentAnswer.know = false;
        finalizeProspect();
        return;
    }
    if (answerKind === "know_yes") {
        state.currentAnswer.know = true;
        btn.parentElement.querySelectorAll(".choice-btn").forEach(el => el.classList.remove("selected"));
        btn.classList.add("selected");
        $("q2").hidden = false;
        $("q2").scrollIntoView({ behavior: "smooth", block: "start" });
        return;
    }
    if (q && v) {
        // Single-pick within this q-block
        btn.parentElement.querySelectorAll(".choice-btn").forEach(el => el.classList.remove("selected"));
        btn.classList.add("selected");
        state.currentAnswer[q] = v;

        // Advance to next q-block
        const nextMap = { quality: "q3", recency: "q4", context: "q5", willing: null };
        const nextId = nextMap[q];
        if (nextId) {
            $(nextId).hidden = false;
            $(nextId).scrollIntoView({ behavior: "smooth", block: "start" });
        } else {
            // willing was the last question — finalize
            setTimeout(finalizeProspect, 200);
        }
    }
});

// ── SKIP ────────────────────────────────────────────────────────────
$("skipBtn")?.addEventListener("click", () => {
    state.currentAnswer.skipped = true;
    finalizeProspect();
});

// ── FINALIZE + SUBMIT PER PROSPECT ─────────────────────────────────
async function finalizeProspect() {
    state.responses.push({ ...state.currentAnswer });
    await submitResponse(state.currentAnswer);
    state.prospectIndex++;
    if (state.prospectIndex >= state.manifest.prospects.length) {
        finishSession();
    } else {
        renderProspect();
    }
}

async function submitResponse(answer) {
    const payload = {
        form: "brain_trust_v1",
        member_id: state.memberId,
        session_id: state.sessionId,
        response: answer,
        received_at: new Date().toISOString(),
    };
    if (!CONFIG.submitEndpoint || CONFIG.submitEndpoint === "PLACEHOLDER_REPLACE_ME") {
        // No endpoint — stash locally and continue
        saveResponseLocally(payload);
        return;
    }
    try {
        const r = await fetch(CONFIG.submitEndpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        if (!r.ok) throw new Error(`submit ${r.status}`);
    } catch (e) {
        saveResponseLocally(payload);
    }
}

function saveResponseLocally(payload) {
    try {
        const key = `brain_trust_responses_${state.memberId}_${state.sessionId}`;
        const existing = JSON.parse(localStorage.getItem(key) || "[]");
        existing.push(payload);
        localStorage.setItem(key, JSON.stringify(existing));
    } catch (e) { /* quota */ }
}

// ── FINISH ─────────────────────────────────────────────────────────
function finishSession() {
    $("progressBar").style.width = "100%";
    $("current").textContent = state.manifest.prospects.length;
    // If we accumulated locally, offer mailto dispatch once.
    try {
        const key = `brain_trust_responses_${state.memberId}_${state.sessionId}`;
        const all = JSON.parse(localStorage.getItem(key) || "[]");
        if (all.length && CONFIG.submitEndpoint === "PLACEHOLDER_REPLACE_ME") {
            const body = encodeURIComponent(
                `Brain Trust responses — ${state.memberId} · ${state.sessionId}\n\n` +
                JSON.stringify(all, null, 2)
            );
            const mailto = `mailto:${CONFIG.fallbackEmail}?subject=${encodeURIComponent(
                `Brain Trust · ${state.memberId} · ${state.sessionId}`
            )}&body=${body}`;
            // Delay slightly, then open mailto so user sees "done" first
            setTimeout(() => { window.location.href = mailto; }, 600);
        }
    } catch (e) { /* ignore */ }
    showStep("done");
}

// ── INIT ───────────────────────────────────────────────────────────
readParams();
loadManifest();
