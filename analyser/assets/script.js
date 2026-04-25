/* ═══════════════════════════════════════════════════════════════════
   NOW Authority Index — wizard logic
   - One question per screen, big-tap answers auto-advance
   - Section intros, text inputs use Next button
   - 22 scoring questions + email + submit + done
   - Pre-fills from ?lead_id=X (if Brand Kit was already done)
   ═══════════════════════════════════════════════════════════════════ */

const CONFIG = {
    submitEndpoint: "https://webhooks.nowgroup.co.nz/forms/marketing-quiz",
    fallbackEmail:  "chris@nowgroup.co.nz",
};

// Steps in display order. Each entry's `data-step` attribute matches the section.
const STEP_ORDER = [
    "0",
    "section-1", "1", "2", "3", "4", "5",
    "section-2", "6", "7", "8", "9", "10",
    "section-3", "11", "12", "13", "14", "15",
    "section-4", "16", "17", "18", "19", "20",
    "section-5", "21", "22",
    "23", "24"
];

// Question step indices (those that count toward "step X / 22")
const QUESTION_STEPS = ["1","2","3","4","5","6","7","8","9","10","11","12","13","14","15","16","17","18","19","20","21","22"];

// ── STATE ────────────────────────────────────────────────────────────
const state = {
    idx: 0,
    answers: {},
    profile: { person_name: "", business_name: "", email: "" },
    lead_id: null,
};

// ── DOM REFS ─────────────────────────────────────────────────────────
const wizard      = document.getElementById("wizard");
const progressBar = document.getElementById("progressBar");
const stepNow     = document.getElementById("stepNow");
const stepTotal   = document.getElementById("stepTotal");

// ── NAV ──────────────────────────────────────────────────────────────
function showIdx(i) {
    state.idx = Math.max(0, Math.min(STEP_ORDER.length - 1, i));
    document.querySelectorAll(".step").forEach(el => el.classList.remove("active"));
    const target = wizard.querySelector(`.step[data-step="${STEP_ORDER[state.idx]}"]`);
    if (target) target.classList.add("active");
    // If we just landed on the success screen (the last step), animate the
    // DNA superscript ticking up to the buyer's actual tier — the brand reveal.
    if (STEP_ORDER[state.idx] === "24") {
        animateSuperscriptReveal();
    }

    // Progress: count QUESTION steps completed
    const cur = STEP_ORDER[state.idx];
    let qNum = 0;
    if (QUESTION_STEPS.includes(cur)) qNum = parseInt(cur, 10);
    else {
        // Use the highest question number we've passed
        for (let k = state.idx; k >= 0; k--) {
            if (QUESTION_STEPS.includes(STEP_ORDER[k])) {
                qNum = parseInt(STEP_ORDER[k], 10);
                break;
            }
        }
    }
    const pad = (n) => String(n).padStart(2, "0");
    stepNow.textContent = pad(Math.max(qNum, 1));
    stepTotal.textContent = "22";
    progressBar.style.width = `${Math.min(100, (qNum / 22) * 100)}%`;
    window.scrollTo({ top: 0, behavior: "smooth" });
    saveLocal();
}

function next() {
    if (!validateStep()) return;
    captureStep();
    showIdx(state.idx + 1);
}
function prev() { showIdx(state.idx - 1); }

// ── VALIDATION ───────────────────────────────────────────────────────
function clearErrors() {
    document.querySelectorAll(".error-msg").forEach(e => e.remove());
    document.querySelectorAll(".error").forEach(e => e.classList.remove("error"));
}
function showError(el, msg) {
    el.classList.add("error");
    const p = document.createElement("div");
    p.className = "error-msg";
    p.textContent = msg;
    el.insertAdjacentElement("afterend", p);
}

function validateStep() {
    clearErrors();
    const cur = wizard.querySelector(".step.active");
    if (!cur) return true;
    let ok = true;

    cur.querySelectorAll("input[data-required], textarea[data-required]").forEach(el => {
        const v = (el.value || "").trim();
        if (!v) { showError(el, "Required."); ok = false; return; }
        const min = parseInt(el.dataset.minchars || "0", 10);
        if (min && v.length < min) {
            showError(el, `At least ${min} characters (you have ${v.length}).`);
            ok = false;
        }
    });
    const consent = cur.querySelector("#consent[data-required]");
    if (consent && !consent.checked) {
        showError(consent.parentElement, "Tick to submit.");
        ok = false;
    }
    return ok;
}

// ── ANSWER CAPTURE ──────────────────────────────────────────────────
function captureStep() {
    const cur = wizard.querySelector(".step.active");
    if (!cur) return;
    cur.querySelectorAll("input, textarea").forEach(el => {
        const name = el.name;
        if (!name) return;
        if (el.type === "checkbox") return;
        if (name in state.profile) state.profile[name] = (el.value || "").trim();
        else state.answers[name] = (el.value || "").trim();
    });
}

// Auto-advance for big-tap answer screens
document.addEventListener("click", (e) => {
    const btn = e.target.closest(".answer-stack .ans");
    if (btn) {
        e.preventDefault();
        const stack = btn.parentElement;
        stack.querySelectorAll(".ans.selected").forEach(el => el.classList.remove("selected"));
        btn.classList.add("selected");
        const q = stack.dataset.q;
        const v = parseInt(btn.dataset.v, 10);
        if (q) state.answers[q] = v;
        // Auto-advance after a short pause for visual feedback
        setTimeout(() => showIdx(state.idx + 1), 240);
    }
    if (e.target.matches("[data-next]")) { e.preventDefault(); next(); }
    if (e.target.matches("[data-prev]")) { e.preventDefault(); prev(); }
});

// ── LEAD_ID PRE-FILL (if they came via Brand Kit) ────────────────────
function readLeadId() {
    const params = new URLSearchParams(window.location.search);
    state.lead_id = params.get("lead_id") || null;
}

// ── LOCAL PERSISTENCE ────────────────────────────────────────────────
function saveLocal() {
    try {
        localStorage.setItem("now_dna_analyser_quiz", JSON.stringify({
            idx: state.idx, answers: state.answers, profile: state.profile, lead_id: state.lead_id,
        }));
    } catch (e) {}
}
function loadLocal() {
    try {
        const raw = localStorage.getItem("now_dna_analyser_quiz");
        if (!raw) return;
        const s = JSON.parse(raw);
        if (s.answers) state.answers = { ...s.answers };
        if (s.profile) state.profile = { ...state.profile, ...s.profile };
        // We don't auto-jump to saved idx — let them start fresh, just preserve answers
    } catch (e) {}
}
loadLocal();
readLeadId();

// ── SCORING (client-side preview, server is authoritative) ──────────
function scoreState() {
    const dims = {
        strategy:   ["q1_icp","q2_positioning","q3_disqualify","q4_diff","q5_voice"],
        systems:    ["q6_crm","q7_pipeline","q8_automation","q9_attribution","q10_followup"],
        content:    ["q11_volume","q12_framework","q13_inbound","q14_owned","q15_geo"],
        conversion: ["q16_conversion","q17_flow","q18_nextstep","q19_referral","q20_moat"],
    };
    const out = {};
    let total = 0;
    Object.entries(dims).forEach(([dim, qs]) => {
        const sum = qs.reduce((acc, q) => acc + (parseInt(state.answers[q], 10) || 0), 0);
        out[dim] = Math.min(10, sum);
        total += out[dim];
    });
    out.total = total;
    // 6-band DNA counting ladder. We use REGULAR DIGITS (not Unicode
    // superscript glyphs) inside <sup> tags so they stay in Blinker
    // — Unicode ¹²³⁴⁵⁶ lacks Blinker glyph coverage past 2 and falls
    // back to a system font, visible as a font shift mid-animation.
    if      (total >= 35) { out.tier = "DNA6"; out.superscript = "6"; }
    else if (total >= 28) { out.tier = "DNA5"; out.superscript = "5"; }
    else if (total >= 21) { out.tier = "DNA4"; out.superscript = "4"; }
    else if (total >= 14) { out.tier = "DNA3"; out.superscript = "3"; }
    else if (total >= 7)  { out.tier = "DNA2"; out.superscript = "2"; }
    else                  { out.tier = "DNA1"; out.superscript = "1"; }
    return out;
}

// ── SUBMIT ───────────────────────────────────────────────────────────
document.getElementById("submitBtn").addEventListener("click", async (e) => {
    e.preventDefault();
    if (!validateStep()) return;
    captureStep();

    const btn = e.target;
    btn.disabled = true;
    btn.textContent = "Building…";

    const payload = {
        form: "marketing_quiz_v1",
        received_at: new Date().toISOString(),
        lead_id: state.lead_id,
        profile: state.profile,
        answers: state.answers,
        client_score: scoreState(),
        submitted_at: new Date().toISOString(),
    };

    let ok = false;
    if (CONFIG.submitEndpoint && CONFIG.submitEndpoint !== "PLACEHOLDER_REPLACE_ME") {
        try {
            const r = await fetch(CONFIG.submitEndpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            ok = r.ok;
        } catch (err) { ok = false; }
    }

    if (ok) {
        try { localStorage.removeItem("now_dna_analyser_quiz"); } catch (e) {}
        showIdx(STEP_ORDER.length - 1);
    } else {
        // Mailto fallback
        const body = encodeURIComponent(
            "NOW Authority quiz submission:\n\n" + JSON.stringify(payload, null, 2)
        );
        window.location.href = `mailto:${CONFIG.fallbackEmail}`
            + `?subject=${encodeURIComponent("NOW Authority Quiz — " + (state.profile.person_name || state.profile.business_name))}`
            + `&body=${body}`;
        showIdx(STEP_ORDER.length - 1);
    }
});

// ── ANIMATED SUPERSCRIPT (X-resolution reveal) ──────────────────────
// Brand mark rests at DNA^X (the question). On submit, X resolves to a
// number 1 through 6 — that's the tier the buyer scored.
// Animation: hold X briefly, then tick through 1 → 2 → ... → user's tier
// and lock there. The X-to-N reveal IS the brand moment.
const SUPERSCRIPTS = ["1", "2", "3", "4", "5", "6"];

function animateSuperscriptReveal() {
    // Use the score we computed at submit time (state.answers should be complete)
    const s = scoreState();
    const tierIndex = Math.max(0, SUPERSCRIPTS.indexOf(s.superscript)); // 0..5
    const targetSup = SUPERSCRIPTS[tierIndex];

    const supEl   = document.getElementById("successSuperscript");
    const iconEl  = document.querySelector(".success-icon");
    const meta    = document.getElementById("revealMeta");
    const revealSup   = document.getElementById("revealSup");
    const revealScore = document.getElementById("revealScore");
    if (!supEl) return;

    // Hold X briefly so the buyer registers "this is my brand moment"
    supEl.textContent = "X";
    supEl.classList.remove("tick");
    void supEl.offsetWidth;
    supEl.classList.add("tick");

    // After 0.7s, start ticking through digits to lock at the buyer's tier.
    // The X resolves to N — the brand is "Done Now, Authentic" reveal moment.
    setTimeout(() => {
        let i = 0;
        const tick = () => {
            supEl.textContent = SUPERSCRIPTS[i];
            supEl.classList.remove("tick");
            void supEl.offsetWidth;
            supEl.classList.add("tick");
            if (i >= tierIndex) {
                // Lock — settle pulse + reveal score meta
                iconEl?.classList.add("locked");
                if (meta) {
                    meta.hidden = false;
                    if (revealSup)   revealSup.textContent = targetSup;
                    if (revealScore) revealScore.textContent = String(s.total);
                }
                return;
            }
            i++;
            setTimeout(tick, 280);
        };
        tick();
    }, 700);
}

// ── INIT ─────────────────────────────────────────────────────────────
showIdx(0);
