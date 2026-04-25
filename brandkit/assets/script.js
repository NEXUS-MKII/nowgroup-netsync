/* ═══════════════════════════════════════════════════════════════════
   NOW Brand Starter Kit — Intake Form Wizard
   ═══════════════════════════════════════════════════════════════════ */

// Configuration — swap the endpoint when you wire up Formspree/Apps Script/etc.
const CONFIG = {
    // Replace with your actual submit endpoint when ready. Examples:
    //   Formspree:        "https://formspree.io/f/YOUR_ID"
    //   Apps Script:      "https://script.google.com/macros/s/YOUR_ID/exec"
    //   Custom endpoint:  "https://your-server.com/api/brandkit-intake"
    submitEndpoint: "https://webhooks.nowgroup.co.nz/forms/brandkit",
    // Fallback: if endpoint is unavailable, save locally + offer mailto.
    fallbackEmail: "chris@nowgroup.co.nz",
    totalSteps: 10,   // including welcome (0) and success (10)
};

// ── STATE ──────────────────────────────────────────────────────────
const state = {
    step: 0,
    answers: {
        person_name: "", person_role: "", business_name: "",
        positioning: "",
        archetype: "",
        vibe_words: [],
        colour_pick: "", colour_palette: null,
        custom_primary: "", custom_accent: "",
        font_feel: "", font_display: "", font_body: "",
        website_url: "", writing_sample: "",
        logo_url: "",
        email: "",
        consent: false,
        submitted_at: null,
    },
};

// ── DOM REFS ───────────────────────────────────────────────────────
const wizard      = document.getElementById("wizard");
const steps       = document.querySelectorAll(".step");
const progressBar = document.getElementById("progressBar");
const stepNow     = document.getElementById("stepNow");
const stepTotal   = document.getElementById("stepTotal");

stepTotal.textContent = CONFIG.totalSteps - 2;  // Hide welcome and success from count

// ── NAV ────────────────────────────────────────────────────────────
function showStep(n) {
    state.step = Math.max(0, Math.min(CONFIG.totalSteps, n));
    steps.forEach((el) => el.classList.remove("active"));
    const target = wizard.querySelector(`.step[data-step="${state.step}"]`);
    if (target) target.classList.add("active");
    // Progress (skip welcome [0] and success [10] from the meter)
    const shown = Math.max(0, state.step - 1);
    const of    = CONFIG.totalSteps - 2;
    const pad = (n) => String(n).padStart(2, "0");
    stepNow.textContent = pad(Math.min(shown, of) || 1);
    stepTotal.textContent = pad(of);
    progressBar.style.width = `${Math.min(100, (shown / of) * 100)}%`;
    // Scroll to top of step
    window.scrollTo({ top: 0, behavior: "smooth" });
    // Persist
    saveToLocal();
}

function next() {
    if (!validateStep(state.step)) return;
    captureStep(state.step);
    showStep(state.step + 1);
}
function prev() { showStep(state.step - 1); }

// ── VALIDATION ─────────────────────────────────────────────────────
function clearErrors() {
    document.querySelectorAll(".error-msg").forEach(e => e.remove());
    document.querySelectorAll("input.error, textarea.error").forEach(e => e.classList.remove("error"));
}
function showError(el, msg) {
    el.classList.add("error");
    const p = document.createElement("div");
    p.className = "error-msg";
    p.textContent = msg;
    el.insertAdjacentElement("afterend", p);
}

function validateStep(n) {
    clearErrors();
    const activeStep = wizard.querySelector(`.step[data-step="${n}"]`);
    if (!activeStep) return true;
    let ok = true;

    // Required text inputs
    activeStep.querySelectorAll("input[data-required], textarea[data-required]").forEach((el) => {
        const v = (el.value || "").trim();
        if (!v) { showError(el, "Required."); ok = false; return; }
        const min = parseInt(el.dataset.minchars || "0", 10);
        if (min && v.length < min) {
            showError(el, `Needs at least ${min} characters (you have ${v.length}).`);
            ok = false;
        }
    });

    // Required pick-grids (single)
    activeStep.querySelectorAll(".pick-grid[data-required]:not(.multi), .swatch-grid[data-required], .font-picks[data-required]").forEach((grid) => {
        if (!grid.querySelector(".selected")) {
            const err = document.createElement("div");
            err.className = "error-msg";
            err.textContent = "Pick one to continue.";
            grid.appendChild(err);
            ok = false;
        }
    });

    // Required multi-select
    activeStep.querySelectorAll(".pick-grid.multi[data-required]").forEach((grid) => {
        const max = parseInt(grid.dataset.maxpicks || "3", 10);
        const count = grid.querySelectorAll(".selected").length;
        if (count < max) {
            const err = document.createElement("div");
            err.className = "error-msg";
            err.textContent = `Pick exactly ${max} (you have ${count}).`;
            grid.appendChild(err);
            ok = false;
        }
    });

    // Consent checkbox
    const consent = activeStep.querySelector("#consent[data-required]");
    if (consent && !consent.checked) {
        showError(consent.parentElement, "Tick the consent box to submit.");
        ok = false;
    }

    return ok;
}

// ── CAPTURE ─────────────────────────────────────────────────────────
function captureStep(n) {
    const activeStep = wizard.querySelector(`.step[data-step="${n}"]`);
    if (!activeStep) return;

    // Text inputs + textareas
    activeStep.querySelectorAll("input, textarea").forEach((el) => {
        const name = el.name;
        if (!name || !(name in state.answers)) return;
        state.answers[name] = (el.value || "").trim();
    });

    // Single-pick grids
    activeStep.querySelectorAll(".pick-grid:not(.multi), .swatch-grid, .font-picks").forEach((grid) => {
        const name = grid.dataset.name;
        if (!name) return;
        const sel = grid.querySelector(".selected");
        if (sel) {
            state.answers[name] = sel.dataset.value;
            // Extra data for colour + fonts
            if (name === "colour_pick" && sel.dataset.primary) {
                state.answers.colour_palette = derivePalette({
                    primary:   sel.dataset.primary,
                    secondary: sel.dataset.secondary,
                    accent:    sel.dataset.accent,
                });
            }
            if (name === "font_feel" && sel.dataset.display) {
                state.answers.font_display = sel.dataset.display;
                state.answers.font_body    = sel.dataset.body;
            }
        }
    });

    // Multi-pick
    activeStep.querySelectorAll(".pick-grid.multi").forEach((grid) => {
        const name = grid.dataset.name;
        state.answers[name] = Array.from(grid.querySelectorAll(".selected")).map(el => el.dataset.value);
    });

    // Custom hex
    if (document.getElementById("customHexToggle")?.checked) {
        const p = document.querySelector('input[name="custom_primary"]')?.value.trim();
        const a = document.querySelector('input[name="custom_accent"]')?.value.trim();
        if (/^#[0-9A-Fa-f]{6}$/.test(p || "")) {
            state.answers.colour_palette = derivePalette({
                primary:   p,
                secondary: a || p,
                accent:    a || p,
            });
            state.answers.colour_pick = "custom";
        }
    }

    // Consent
    const consent = activeStep.querySelector("#consent");
    if (consent) state.answers.consent = consent.checked;
}

// ── PALETTE DERIVATION (from one pick, build full 8-swatch system) ──
function derivePalette({ primary, secondary, accent }) {
    return {
        primary:      primary,
        secondary:    secondary,
        accent:       accent,
        accent_soft:  lighten(accent, 0.35),
        cta:          secondary,
        cta_accent:   darken(secondary, 0.15),
        ink:          "#0F172A",
        body:         "#374151",
        cream:        "#FAFAF9",
        mozzarella:   "#F5F5F4",
        charcoal:     primary,
        red_flag:     "#DC2626",
        rule:         "#E5E7EB",
    };
}
function hexToRgb(hex) {
    const h = hex.replace("#", "");
    return [parseInt(h.substring(0, 2), 16), parseInt(h.substring(2, 4), 16), parseInt(h.substring(4, 6), 16)];
}
function rgbToHex(r, g, b) {
    const c = (x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, "0");
    return "#" + c(r) + c(g) + c(b);
}
function lighten(hex, amount) {
    const [r, g, b] = hexToRgb(hex);
    return rgbToHex(r + (255 - r) * amount, g + (255 - g) * amount, b + (255 - b) * amount);
}
function darken(hex, amount) {
    const [r, g, b] = hexToRgb(hex);
    return rgbToHex(r * (1 - amount), g * (1 - amount), b * (1 - amount));
}

// ── PICK-GRID INTERACTION ──────────────────────────────────────────
document.addEventListener("click", (e) => {
    // Single-pick grid, swatch grid, font picks
    const pick = e.target.closest(".pick-grid:not(.multi) .pick, .swatch-grid .swatch-pick, .font-picks .font-pick");
    if (pick) {
        e.preventDefault();
        pick.parentElement.querySelectorAll(".selected").forEach(el => el.classList.remove("selected"));
        pick.classList.add("selected");
        clearErrors();
        return;
    }
    // Multi-pick
    const multi = e.target.closest(".pick-grid.multi .pick");
    if (multi) {
        e.preventDefault();
        const grid = multi.parentElement;
        const max = parseInt(grid.dataset.maxpicks || "3", 10);
        if (multi.classList.contains("selected")) {
            multi.classList.remove("selected");
        } else if (grid.querySelectorAll(".selected").length < max) {
            multi.classList.add("selected");
        }
        const counter = document.getElementById("vibeCount");
        if (counter) counter.textContent = grid.querySelectorAll(".selected").length;
        clearErrors();
        return;
    }
});

// ── NEXT/BACK ──────────────────────────────────────────────────────
document.addEventListener("click", (e) => {
    if (e.target.matches("[data-next]")) { e.preventDefault(); next(); }
    if (e.target.matches("[data-prev]")) { e.preventDefault(); prev(); }
});

// ── LIVE COUNTERS ──────────────────────────────────────────────────
document.addEventListener("input", (e) => {
    if (e.target.name === "writing_sample") {
        const c = document.getElementById("writingCount");
        if (c) c.textContent = e.target.value.length.toLocaleString();
    }
});

// Custom hex toggle
document.getElementById("customHexToggle")?.addEventListener("change", (e) => {
    document.getElementById("hexInputs").hidden = !e.target.checked;
    if (e.target.checked) {
        document.querySelectorAll(".swatch-pick.selected").forEach(el => el.classList.remove("selected"));
    }
});

// ── LOCAL PERSISTENCE ──────────────────────────────────────────────
function saveToLocal() {
    try { localStorage.setItem("brandkit_intake", JSON.stringify({ step: state.step, answers: state.answers })); }
    catch (e) { /* quota / private mode */ }
}
function loadFromLocal() {
    try {
        const raw = localStorage.getItem("brandkit_intake");
        if (!raw) return;
        const saved = JSON.parse(raw);
        if (saved && saved.answers) {
            Object.assign(state.answers, saved.answers);
            // Note: we don't auto-jump to saved.step — they may want to revisit.
        }
    } catch (e) { /* bad json */ }
}
loadFromLocal();

// ── SUBMIT ─────────────────────────────────────────────────────────
document.getElementById("submitBtn").addEventListener("click", async (e) => {
    e.preventDefault();
    if (!validateStep(state.step)) return;
    captureStep(state.step);

    const btn = e.target;
    btn.disabled = true;
    btn.textContent = "Sending…";

    state.answers.submitted_at = new Date().toISOString();

    const payload = {
        form: "brandkit_intake_v1",
        received_at: state.answers.submitted_at,
        answers: state.answers,
    };

    let ok = false;
    if (CONFIG.submitEndpoint && CONFIG.submitEndpoint !== "PLACEHOLDER_REPLACE_ME") {
        try {
            const r = await fetch(CONFIG.submitEndpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json", "Accept": "application/json" },
                body: JSON.stringify(payload),
            });
            ok = r.ok;
        } catch (err) { ok = false; }
    }

    if (ok) {
        // Clear local draft on successful submit.
        try { localStorage.removeItem("brandkit_intake"); } catch (e) {}
        showStep(10);
    } else {
        // Fallback: save locally + offer mailto dispatch.
        try {
            const all = JSON.parse(localStorage.getItem("brandkit_intake_submissions") || "[]");
            all.push(payload);
            localStorage.setItem("brandkit_intake_submissions", JSON.stringify(all));
        } catch (e) {}
        // Mailto fallback
        const body = encodeURIComponent(
            "New Brand Kit intake submission:\n\n" + JSON.stringify(payload, null, 2)
        );
        window.location.href = `mailto:${CONFIG.fallbackEmail}?subject=${encodeURIComponent("Brand Kit Intake — " + (state.answers.business_name || state.answers.person_name))}&body=${body}`;
        showStep(10);
    }
});

// ── INIT ───────────────────────────────────────────────────────────
showStep(0);
