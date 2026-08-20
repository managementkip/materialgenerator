const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const STORAGE_KEYS = {
  gasUrl: "https://script.google.com/macros/s/AKfycbwlJTYq6NPG9JdY6I8eb4cGiNh4N_8GFuiYQz5fpIbrZXrkDHNrKsY6TdIBwq9F7huGTg/exec",
  sessionToken: "83622289146b4cb0aadb00ded25eb0218b4f8bc9ea444ba4918e7a156434dcbe"
};

const state = {
  user: null,
  token: sessionStorage.getItem(STORAGE_KEYS.sessionToken) || "",
  date: null,
  materials: [],
  jobs: new Map(),
  health: null
};

const loginView = $("#loginView");
const appView = $("#appView");
const loginForm = $("#loginForm");
const loginBtn = $("#loginBtn");
const loginStatus = $("#loginStatus");
const gasUrlInput = $("#gasUrlInput");
const saveGasUrlBtn = $("#saveGasUrlBtn");
const materialDate = $("#materialDate");
const loadMaterialsBtn = $("#loadMaterialsBtn");
const generateAllP1Btn = $("#generateAllP1Btn");
const generateAllP2Btn = $("#generateAllP2Btn");
const materialsGrid = $("#materialsGrid");
const globalStatus = $("#globalStatus");
const logoutBtn = $("#logoutBtn");
const clearSessionBtn = $("#clearSessionBtn");

function setStatus(el, message, kind = "info") {
  el.textContent = message;
  el.className = `status-box ${kind}`;
}
function clearStatus(el) {
  el.textContent = "";
  el.className = "status-box hidden";
}
function loadingButton(btn, label) {
  const previous = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<span class="loader"></span>${label}`;
  return () => { btn.innerHTML = previous; };
}
function sanitizeFilename(text) {
  return String(text || "material")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/[^a-zA-Z0-9._ -]+/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 120) || "material";
}
function formatDate(dateString) {
  if (!dateString) return "—";
  const [y,m,d] = dateString.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { day:"2-digit", month:"long", year:"numeric" }).format(new Date(y,m-1,d));
}
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
}
function shortError(error) {
  const raw = error?.message || String(error);
  return raw.length > 220 ? raw.slice(0,217) + "…" : raw;
}
function getGasUrl() {
  return (localStorage.getItem(STORAGE_KEYS.gasUrl) || "").trim();
}
function validateGasUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.hostname === "script.google.com" && /\/macros\/s\/.+\/exec$/.test(parsed.pathname);
  } catch {
    return false;
  }
}

async function gasCall(action, payload = {}, { auth = true } = {}) {
  const url = getGasUrl();
  if (!validateGasUrl(url)) {
    throw new Error("Apps Script Web App URL is not configured. Open ‘First-time Apps Script connection’ and paste the deployed /exec URL.");
  }
  const body = {
    action,
    ...(auth ? { token: state.token || "" } : {}),
    ...payload
  };
  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      redirect: "follow",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(body)
    });
  } catch (error) {
    throw new Error(`Could not reach Apps Script. Confirm the /exec URL, deploy access as “Anyone”, and keep Content-Type as text/plain. ${error?.message || ""}`.trim());
  }
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); }
  catch {
    throw new Error("Apps Script returned an unreadable response. Make sure you are using the Web App /exec URL, not the editor or /dev URL.");
  }
  if (!data?.ok) {
    if (data?.code === "AUTH_REQUIRED" || data?.code === "AUTH_EXPIRED") {
      state.token = "";
      sessionStorage.removeItem(STORAGE_KEYS.sessionToken);
      if (auth) showLogin();
    }
    const err = new Error(data?.error || "Apps Script request failed");
    err.code = data?.code;
    throw err;
  }
  return data;
}

function newJob(material) {
  return {
    materialId: material.materialId,
    p1: { status:"idle", url:null, tempFileId:null, error:null, approved:false, promptHash:null },
    p2: { status:"locked", url:null, tempFileId:null, error:null, approved:false, promptHash:null },
    pdfBlob: null,
    pdfFilename: null
  };
}
function jobFor(material) {
  if (!state.jobs.has(material.materialId)) state.jobs.set(material.materialId, newJob(material));
  return state.jobs.get(material.materialId);
}
function activeTempFileIds() {
  const ids = [];
  for (const job of state.jobs.values()) {
    if (job.p1.tempFileId) ids.push(job.p1.tempFileId);
    if (job.p2.tempFileId) ids.push(job.p2.tempFileId);
  }
  return [...new Set(ids)];
}
async function cleanupFileIds(fileIds) {
  if (!fileIds?.length || !state.token) return;
  try {
    await gasCall("cleanup", { fileIds });
  } catch (error) {
    console.warn("Temporary Drive cleanup failed", error);
  }
}

function showLogin() {
  appView.classList.add("hidden");
  loginView.classList.remove("hidden");
  gasUrlInput.value = getGasUrl();
}
function showApp() {
  loginView.classList.add("hidden");
  appView.classList.remove("hidden");
  refreshHealth();
}

saveGasUrlBtn.addEventListener("click", () => {
  const url = gasUrlInput.value.trim();
  if (!validateGasUrl(url)) {
    setStatus(loginStatus, "Use the deployed Apps Script Web App URL ending in /exec.", "error");
    return;
  }
  localStorage.setItem(STORAGE_KEYS.gasUrl, url);
  setStatus(loginStatus, "Apps Script connection URL saved in this browser.", "ok");
});

async function checkSession() {
  gasUrlInput.value = getGasUrl();
  if (!state.token || !validateGasUrl(getGasUrl())) return showLogin();
  try {
    const data = await gasCall("auth");
    state.user = data.user;
    showApp();
  } catch {
    state.token = "";
    sessionStorage.removeItem(STORAGE_KEYS.sessionToken);
    showLogin();
  }
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearStatus(loginStatus);
  const done = loadingButton(loginBtn, "Signing in…");
  try {
    const data = await gasCall("login", {
      email: $("#loginEmail").value.trim(),
      password: $("#loginPassword").value
    }, { auth:false });
    state.token = data.token;
    state.user = data.user;
    sessionStorage.setItem(STORAGE_KEYS.sessionToken, data.token);
    $("#loginPassword").value = "";
    showApp();
  } catch (error) {
    setStatus(loginStatus, shortError(error), "error");
  } finally {
    done();
    loginBtn.disabled = false;
  }
});

logoutBtn.addEventListener("click", async () => {
  await cleanupFileIds(activeTempFileIds());
  state.jobs.clear();
  state.materials = [];
  state.token = "";
  state.user = null;
  sessionStorage.removeItem(STORAGE_KEYS.sessionToken);
  showLogin();
});

clearSessionBtn.addEventListener("click", async () => {
  if (!state.jobs.size) return;
  if (!confirm("Clear all temporary generated images from Drive and reset this production session? PDFs already downloaded to your computer are not affected.")) return;
  const done = loadingButton(clearSessionBtn, "Clearing…");
  await cleanupFileIds(activeTempFileIds());
  state.jobs.clear();
  for (const entry of state.materials) if (entry.material) state.jobs.set(entry.material.materialId, newJob(entry.material));
  renderMaterials();
  updateSummary();
  done();
  clearSessionBtn.disabled = false;
});

async function refreshHealth() {
  try {
    const health = await gasCall("health");
    state.health = health;
    for (const [key, value] of Object.entries(health.configured || {})) {
      const el = $(`.system-chip[data-system="${key}"]`);
      if (!el) continue;
      el.classList.toggle("ok", Boolean(value));
      el.classList.toggle("bad", !value);
      $("small", el).textContent = value ? "ready" : "missing config";
    }
  } catch (error) {
    console.warn(error);
    setStatus(globalStatus, shortError(error), "error");
  }
}

loadMaterialsBtn.addEventListener("click", loadMaterials);
materialDate.addEventListener("keydown", (e) => { if (e.key === "Enter") loadMaterials(); });

async function loadMaterials() {
  const date = materialDate.value;
  if (!date) return setStatus(globalStatus, "Choose a material date first.", "warn");
  clearStatus(globalStatus);
  const oldIds = activeTempFileIds();
  const done = loadingButton(loadMaterialsBtn, "Loading…");
  try {
    if (oldIds.length) await cleanupFileIds(oldIds);
    const data = await gasCall("materials", { date });
    state.date = date;
    state.materials = data.materials || [];
    state.jobs.clear();
    for (const entry of state.materials) if (entry.material) state.jobs.set(entry.material.materialId, newJob(entry.material));
    renderMaterials();
    updateSummary();
    if (data.count === 5) setStatus(globalStatus, `Loaded all 5 materials for ${formatDate(date)}.`, "ok");
    else setStatus(globalStatus, `Loaded ${data.count}/5 materials for ${formatDate(date)}. Missing levels are shown below.`, "warn");
  } catch (error) {
    setStatus(globalStatus, shortError(error), "error");
  } finally {
    done();
    loadMaterialsBtn.disabled = false;
  }
}

function renderMaterials() {
  if (!state.materials.length) {
    materialsGrid.innerHTML = `<div class="empty-state"><div class="empty-icon">5×</div><h3>Load a material date to begin</h3><p>The app will retrieve one matching row from each of the five level sheets.</p></div>`;
    updateMasterButtons();
    return;
  }
  materialsGrid.innerHTML = state.materials.map((entry, index) => entry.material ? materialCard(entry, index) : missingCard(entry)).join("");
  bindCardEvents();
  updateMasterButtons();
}

function missingCard(entry) {
  return `<article class="material-card missing-card">
    <div class="missing-icon">!</div>
    <h3>${escapeHtml(entry.label)}</h3>
    <p>No material row was found for ${escapeHtml(formatDate(state.date))} in <b>${escapeHtml(entry.sheetName)}</b>.</p>
  </article>`;
}

function stageState(stage) {
  if (stage.approved) return ["approved", "Approved"];
  if (stage.status === "generating") return ["generating", "Generating"];
  if (stage.status === "generated") return ["generated", "QC Review"];
  if (stage.status === "error") return ["error", "Error"];
  if (stage.status === "locked") return ["locked", "Locked"];
  return ["", "Not Generated"];
}

function materialCard(entry, index) {
  const m = entry.material;
  const job = jobFor(m);
  const [p1Class,p1Text] = stageState(job.p1);
  const [p2Class,p2Text] = stageState(job.p2);
  const pdfReady = job.p1.approved && job.p2.approved;
  const materialCount = state.materials.filter(x => x.material).length;
  const wide = materialCount % 2 === 1 && index === state.materials.length - 1 ? "span-wide" : "";
  return `<article class="material-card ${wide}" data-material-id="${escapeHtml(m.materialId)}">
    <div class="card-accent"></div>
    <div class="material-head">
      <div class="material-title-wrap">
        <span class="level-badge">${escapeHtml(m.level)}</span>
        <h3>${escapeHtml(m.topic)}</h3>
        <div class="theme">${escapeHtml(m.theme)}</div>
      </div>
      <div class="material-head-side">
        <span class="status-pill ${entry.ready ? "ready":"hold"}">${escapeHtml(m.status)}</span>
        <img class="card-logo-mark" src="./assets/kip-watermark.png" alt="KIP" />
      </div>
    </div>
    <div class="meta-row">
      <span class="meta-chip">Week ${escapeHtml(m.week)}</span>
      <span class="meta-chip">Meeting ${escapeHtml(m.meeting)}</span>
      <span class="meta-chip">${escapeHtml(formatDate(m.date))}</span>
      <span class="meta-chip material-id">${escapeHtml(m.materialId)}</span>
    </div>
    <div class="brand-row">
      <span class="brand-chip brand-chip-navy">KIP palette</span>
      <span class="brand-chip brand-chip-red">Exact Sheet prompt</span>
      <span class="brand-chip brand-chip-soft">Automatic watermark</span>
    </div>
    ${m.notes ? `<div class="notes-box">${escapeHtml(m.notes)}</div>` : ""}
    <div class="workflow">
      <div class="workflow-grid">
        ${pageStageHtml(m, job, 1, p1Class, p1Text, entry.ready)}
        ${pageStageHtml(m, job, 2, p2Class, p2Text, entry.ready)}
      </div>
      <div class="pdf-zone ${pdfReady ? "ready":""}">
        <div class="pdf-copy">
          <strong>${job.pdfBlob ? "PDF generated" : pdfReady ? "Both pages approved — PDF unlocked" : "Final PDF locked"}</strong>
          <span>${escapeHtml(m.materialId)}__${escapeHtml(sanitizeFilename(m.topic))}.pdf</span>
        </div>
        <div class="pdf-actions">
          <button class="btn btn-navy" data-action="generate-pdf" ${pdfReady ? "":"disabled"}>${job.pdfBlob ? "Regenerate PDF":"Generate PDF"}</button>
          <button class="btn btn-ghost" data-action="download-pdf" ${job.pdfBlob ? "":"disabled"}>Download PDF</button>
        </div>
      </div>
    </div>
  </article>`;
}

function pageStageHtml(m, job, page, stateClass, stateText, ready) {
  const stage = page === 1 ? job.p1 : job.p2;
  const locked = page === 2 && !job.p1.approved;
  const image = stage.url
    ? `<img src="${stage.url}" alt="${escapeHtml(m.level)} Page ${page}" data-action="preview" data-page="${page}" />`
    : `<div class="preview-placeholder"><b>${locked ? "🔒" : `P${page}`}</b>${locked ? "Approve Page 1 first" : "No image generated yet"}</div>`;

  let controls = "";
  if (!ready) controls = `<button class="btn btn-ghost full" disabled>Database status is not ready</button>`;
  else if (locked) controls = `<button class="btn btn-ghost full" disabled>Locked until Page 1 approval</button>`;
  else if (stage.status === "generating") controls = `<button class="btn btn-navy full" disabled><span class="loader"></span>Generating Page ${page}</button>`;
  else if (!stage.url) controls = `<button class="btn ${page === 1 ? "btn-red":"btn-navy"} full" data-action="generate" data-page="${page}">Generate Page ${page}</button>`;
  else if (!stage.approved) controls = `<button class="btn btn-ghost" data-action="generate" data-page="${page}">Regenerate</button><button class="btn btn-navy" data-action="approve" data-page="${page}">Approve</button>`;
  else controls = `<button class="btn btn-ghost" data-action="generate" data-page="${page}">Regenerate</button><button class="btn btn-ghost" disabled>✓ Approved</button>`;

  return `<div class="page-stage">
    <div class="stage-head"><strong>Page ${page}</strong><span class="stage-state ${stateClass}">${stateText}</span></div>
    <div class="preview-box">
      <div class="preview-watermark-badge">KIP Watermarked</div>
      ${image}
    </div>
    <div class="stage-actions">${controls}</div>
    ${stage.error ? `<div class="stage-error">${escapeHtml(stage.error)}</div>` : ""}
    <div class="stage-foot">${stage.promptHash ? `Prompt hash: ${escapeHtml(stage.promptHash)} · exact Sheet prompt` : page === 2 && job.p1.approved ? "Exact Page 2 Prompt + approved Page 1 + official KIP logo reference." : page === 1 ? "Exact Page 1 Prompt + official KIP logo reference." : ""}</div>
  </div>`;
}

function bindCardEvents() {
  $$(".material-card[data-material-id]").forEach(card => {
    const materialId = card.dataset.materialId;
    const m = findMaterial(materialId);
    if (!m) return;
    card.addEventListener("click", async (event) => {
      const target = event.target.closest("[data-action]");
      if (!target) return;
      const action = target.dataset.action;
      const page = Number(target.dataset.page || 0);
      if (action === "generate") await generatePage(m, page);
      if (action === "approve") approvePage(m, page);
      if (action === "preview") openPreview(m, page);
      if (action === "generate-pdf") await generatePdf(m);
      if (action === "download-pdf") downloadPdf(m);
    });
  });
}
function findMaterial(materialId) {
  return state.materials.map(x => x.material).find(m => m?.materialId === materialId) || null;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
async function applyKipWatermark(rawDataUrl) {
  const [source, mark] = await Promise.all([
    loadImage(rawDataUrl),
    loadImage(new URL("./assets/kip-watermark.png", window.location.href).href)
  ]);
  const canvas = document.createElement("canvas");
  canvas.width = source.naturalWidth;
  canvas.height = source.naturalHeight;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(source, 0, 0);

  const targetW = Math.max(170, Math.min(360, Math.round(canvas.width * 0.135)));
  const targetH = Math.round(mark.naturalHeight * (targetW / mark.naturalWidth));
  const padding = Math.max(28, Math.round(canvas.width * 0.022));
  ctx.save();
  ctx.globalAlpha = 0.16;
  ctx.drawImage(mark, canvas.width - targetW - padding, canvas.height - targetH - padding, targetW, targetH);
  ctx.restore();
  return canvas.toDataURL("image/png");
}

async function generatePage(material, page) {
  const job = jobFor(material);
  const stage = page === 1 ? job.p1 : job.p2;
  if (page === 2 && !job.p1.approved) return;

  if (page === 1 && job.p2.tempFileId) {
    const ok = confirm("Regenerating Page 1 will discard the current Page 2 because Page 2 must connect to the approved Page 1. Continue?");
    if (!ok) return;
    await cleanupFileIds([job.p2.tempFileId]);
    job.p2 = { status:"locked", url:null, tempFileId:null, error:null, approved:false, promptHash:null };
  }

  stage.status = "generating";
  stage.error = null;
  stage.approved = false;
  if (page === 1) job.p2.status = "locked";
  job.pdfBlob = null;
  job.pdfFilename = null;
  renderMaterials();
  updateSummary();

  try {
    const data = await gasCall("generate", {
      materialId: material.materialId,
      page,
      previousFileId: stage.tempFileId || "",
      page1FileId: page === 2 ? (job.p1.tempFileId || "") : ""
    });
    const raw = `data:${data.image.mimeType || "image/png"};base64,${data.image.b64}`;
    stage.url = await applyKipWatermark(raw);
    stage.tempFileId = data.image.tempFileId;
    stage.promptHash = data.image.promptHash;
    stage.status = "generated";
    stage.error = null;
  } catch (error) {
    stage.status = "error";
    stage.error = shortError(error);
  }
  renderMaterials();
  updateSummary();
}

function approvePage(material, page) {
  const job = jobFor(material);
  const stage = page === 1 ? job.p1 : job.p2;
  if (!stage.url || stage.status === "generating") return;
  stage.approved = true;
  stage.status = "generated";
  stage.error = null;
  if (page === 1 && !job.p2.url) job.p2.status = "idle";
  if (page === 2) job.pdfBlob = null;
  renderMaterials();
  updateSummary();
}

async function runWithConcurrency(items, limit, worker) {
  let index = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const current = items[index++];
      await worker(current);
    }
  });
  await Promise.all(runners);
}

generateAllP1Btn.addEventListener("click", async () => {
  const candidates = state.materials.filter(x => x.ready && x.material).map(x => x.material)
    .filter(m => jobFor(m).p1.status !== "generating" && !jobFor(m).p1.approved);
  if (!candidates.length) return;
  generateAllP1Btn.disabled = true;
  setStatus(globalStatus, `Generating Page 1 for ${candidates.length} material${candidates.length === 1 ? "":"s"}. Each job is independent; only failed cards need retrying.`, "info");
  await runWithConcurrency(candidates, 2, m => generatePage(m, 1));
  const failures = candidates.filter(m => jobFor(m).p1.status === "error").length;
  setStatus(globalStatus, failures ? `Page 1 batch finished with ${failures} failed job${failures === 1 ? "":"s"}. Retry only those card(s).` : "Page 1 batch finished. Review and approve each result before Page 2.", failures ? "warn":"ok");
  updateMasterButtons();
});

generateAllP2Btn.addEventListener("click", async () => {
  const candidates = state.materials.filter(x => x.ready && x.material).map(x => x.material)
    .filter(m => {
      const j = jobFor(m);
      return j.p1.approved && !j.p2.approved && j.p2.status !== "generating";
    });
  if (!candidates.length) return;
  generateAllP2Btn.disabled = true;
  setStatus(globalStatus, `Generating connected Page 2 for ${candidates.length} approved Page 1 material${candidates.length === 1 ? "":"s"}.`, "info");
  await runWithConcurrency(candidates, 2, m => generatePage(m, 2));
  const failures = candidates.filter(m => jobFor(m).p2.status === "error").length;
  setStatus(globalStatus, failures ? `Page 2 batch finished with ${failures} failed job${failures === 1 ? "":"s"}. Retry only those cards.` : "Page 2 batch finished. Review and approve each result to unlock PDF generation.", failures ? "warn":"ok");
  updateMasterButtons();
});

function updateMasterButtons() {
  const readyMaterials = state.materials.filter(x => x.ready && x.material).map(x => x.material);
  const p1Candidates = readyMaterials.filter(m => !jobFor(m).p1.approved && jobFor(m).p1.status !== "generating");
  const p2Candidates = readyMaterials.filter(m => jobFor(m).p1.approved && !jobFor(m).p2.approved && jobFor(m).p2.status !== "generating");
  generateAllP1Btn.disabled = p1Candidates.length === 0;
  generateAllP2Btn.disabled = p2Candidates.length === 0;
}

function updateSummary() {
  const materials = state.materials.filter(x => x.material).map(x => x.material);
  const p1 = materials.filter(m => jobFor(m).p1.approved).length;
  const p2 = materials.filter(m => jobFor(m).p2.approved).length;
  const pdf = materials.filter(m => Boolean(jobFor(m).pdfBlob)).length;
  $("#summaryDate").textContent = state.date ? formatDate(state.date) : "—";
  $("#summaryLoaded").textContent = `${materials.length} / 5`;
  $("#summaryP1").textContent = `${p1} / 5`;
  $("#summaryP2").textContent = `${p2} / 5`;
  $("#summaryPdf").textContent = `${pdf} / 5`;
  updateMasterButtons();
}

async function dataUrlToBytes(dataUrl) {
  const response = await fetch(dataUrl);
  return new Uint8Array(await response.arrayBuffer());
}

async function generatePdf(material) {
  const job = jobFor(material);
  if (!job.p1.approved || !job.p2.approved || !job.p1.url || !job.p2.url) return;
  const card = $(`.material-card[data-material-id="${CSS.escape(material.materialId)}"]`);
  const button = card?.querySelector('[data-action="generate-pdf"]');
  const restore = button ? loadingButton(button, "Building…") : () => {};
  try {
    const { PDFDocument } = window.PDFLib;
    const pdfDoc = await PDFDocument.create();
    for (const dataUrl of [job.p1.url, job.p2.url]) {
      const bytes = await dataUrlToBytes(dataUrl);
      const image = await pdfDoc.embedPng(bytes);
      const page = pdfDoc.addPage([595.2756, 841.8898]);
      page.drawImage(image, { x:0, y:0, width:page.getWidth(), height:page.getHeight() });
    }
    const bytes = await pdfDoc.save({ useObjectStreams:true });
    job.pdfBlob = new Blob([bytes], { type:"application/pdf" });
    job.pdfFilename = `${sanitizeFilename(material.materialId)}__${sanitizeFilename(material.topic)}.pdf`;
    renderMaterials();
    updateSummary();
    setStatus(globalStatus, `PDF ready: ${job.pdfFilename}`, "ok");
  } catch (error) {
    setStatus(globalStatus, `PDF generation failed: ${shortError(error)}`, "error");
  } finally {
    restore();
  }
}

function downloadPdf(material) {
  const job = jobFor(material);
  if (!job.pdfBlob) return;
  const url = URL.createObjectURL(job.pdfBlob);
  const a = document.createElement("a");
  a.href = url;
  a.download = job.pdfFilename || `${sanitizeFilename(material.materialId)}__${sanitizeFilename(material.topic)}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

const modal = $("#imageModal");
function openPreview(material, page) {
  const job = jobFor(material);
  const url = page === 1 ? job.p1.url : job.p2.url;
  if (!url) return;
  $("#modalLevel").textContent = material.level;
  $("#modalTitle").textContent = `${material.topic} · Page ${page}`;
  $("#modalImage").src = url;
  $("#modalOpenLink").href = url;
  modal.classList.remove("hidden");
  document.body.classList.add("modal-open");
}
function closeModal() {
  modal.classList.add("hidden");
  $("#modalImage").src = "";
  document.body.classList.remove("modal-open");
}
$("#closeModalBtn").addEventListener("click", closeModal);
modal.addEventListener("click", e => { if (e.target === modal) closeModal(); });
document.addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); });

window.addEventListener("beforeunload", () => {
  // Browser unload is unreliable for cleanup. Use Clear Session or Sign Out for deterministic temporary Drive cleanup.
});

checkSession();
