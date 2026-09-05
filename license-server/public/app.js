const tokenInput = document.getElementById("token");
const statusEl = document.getElementById("status");
const authBadge = document.getElementById("authBadge");
const tbody = document.getElementById("tbody");
const filterInput = document.getElementById("filterInput");
const countPill = document.getElementById("countPill");
const checkResult = document.getElementById("checkResult");
const issuedTbody = document.getElementById("issuedTbody");
const issuedFilterInput = document.getElementById("issuedFilterInput");
const issuedCountPill = document.getElementById("issuedCountPill");

let allRevocations = [];
let allIssued = [];

function getToken() {
  return (
    tokenInput.value.trim() ||
    localStorage.getItem("cortexis_admin_token") ||
    ""
  );
}

function setStatus(message, kind) {
  statusEl.textContent = message;
  statusEl.className = kind || "";
}

function setAuthBadge(kind, text) {
  authBadge.textContent = text;
  authBadge.className = kind || "";
}

function setButtonsBusy(buttons, busy) {
  buttons.forEach((btn) => {
    btn.disabled = busy;
  });
}

async function apiFetch(path, options) {
  const token = getToken();
  if (!token) throw new Error("Informe o token administrativo primeiro.");
  const response = await fetch(path, {
    ...options,
    headers: {
      ...(options?.headers || {}),
      Authorization: `Bearer ${token}`,
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(data.error || `Falha na requisição (${response.status})`);
  return data;
}

function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c],
  );
}

async function validateAndLoad() {
  const token = tokenInput.value.trim();
  if (!token) {
    setStatus("Informe o token antes de guardar.", "error");
    setAuthBadge("", "");
    return;
  }
  try {
    setStatus("A validar token...", "");
    await apiFetch("/auth/check");
    localStorage.setItem("cortexis_admin_token", token);
    setStatus("Token válido. Guardado neste navegador.", "ok");
    setAuthBadge("ok", "Autenticado");
    await loadList();
    await loadIssued();
  } catch (error) {
    setAuthBadge("error", "Token inválido");
    setStatus(error.message, "error");
  }
}

document.getElementById("saveToken").addEventListener("click", validateAndLoad);

document.getElementById("clearToken").addEventListener("click", () => {
  localStorage.removeItem("cortexis_admin_token");
  tokenInput.value = "";
  allRevocations = [];
  allIssued = [];
  renderRows([]);
  renderIssuedRows([]);
  setAuthBadge("", "");
  setStatus("Token removido deste navegador.", "ok");
});

const savedToken = localStorage.getItem("cortexis_admin_token");
if (savedToken) tokenInput.value = savedToken;

function renderRows(revocations) {
  countPill.textContent = revocations.length
    ? `${revocations.length} licença(s)`
    : "";
  if (!revocations.length) {
    tbody.innerHTML =
      '<tr><td colspan="5" class="empty">Nenhuma licença revogada.</td></tr>';
    return;
  }
  tbody.innerHTML = "";
  for (const item of revocations) {
    const tr = document.createElement("tr");
    const revokedAt = new Date(item.revokedAt).toLocaleString("pt-BR");
    tr.innerHTML = `
      <td class="mono">${escapeHtml(item.licenseId)}</td>
      <td>${escapeHtml(item.customer || "—")}</td>
      <td>${escapeHtml(revokedAt)}</td>
      <td>${escapeHtml(item.reason || "—")}</td>
      <td class="row-actions"><button class="secondary" data-unrevoke="${escapeHtml(item.licenseId)}">Reverter</button></td>
    `;
    tbody.appendChild(tr);
  }
  tbody.querySelectorAll("[data-unrevoke]").forEach((btn) => {
    btn.addEventListener("click", () =>
      unrevoke(btn.getAttribute("data-unrevoke"), btn),
    );
  });
}

function applyFilter() {
  const term = filterInput.value.trim().toLowerCase();
  if (!term) {
    renderRows(allRevocations);
    return;
  }
  const filtered = allRevocations.filter((item) =>
    [item.licenseId, item.customer, item.reason]
      .filter(Boolean)
      .some((field) => field.toLowerCase().includes(term)),
  );
  renderRows(filtered);
}

async function loadList() {
  try {
    setStatus("A carregar...", "");
    const data = await apiFetch("/licenses");
    allRevocations = data.revocations || [];
    applyFilter();
    applyIssuedFilter();
    setStatus(`${allRevocations.length} licença(s) revogada(s).`, "ok");
  } catch (error) {
    setStatus(error.message, "error");
  }
}

async function revoke() {
  const licenseId = document.getElementById("licenseId").value.trim();
  const customer = document.getElementById("customer").value.trim();
  const reason = document.getElementById("reason").value.trim();
  if (!licenseId) {
    setStatus("Informe o licenseId.", "error");
    return;
  }
  if (
    !confirm(
      `Confirma a revogação da licença "${licenseId}"? O app pára de funcionar assim que verificar.`,
    )
  ) {
    return;
  }
  const btn = document.getElementById("revokeBtn");
  setButtonsBusy([btn], true);
  try {
    setStatus("A revogar...", "");
    await apiFetch(`/licenses/${encodeURIComponent(licenseId)}/revoke`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reason: reason || null,
        customer: customer || null,
      }),
    });
    setStatus("Licença revogada com sucesso.", "ok");
    document.getElementById("licenseId").value = "";
    document.getElementById("customer").value = "";
    document.getElementById("reason").value = "";
    loadList();
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    setButtonsBusy([btn], false);
  }
}

async function unrevoke(licenseId, btn) {
  if (
    !confirm(
      `Confirma reverter a revogação de "${licenseId}"? A licença volta a ficar ativa.`,
    )
  ) {
    return;
  }
  setButtonsBusy([btn], true);
  try {
    setStatus("A reverter...", "");
    await apiFetch(`/licenses/${encodeURIComponent(licenseId)}/unrevoke`, {
      method: "POST",
    });
    setStatus("Revogação revertida.", "ok");
    loadList();
  } catch (error) {
    setStatus(error.message, "error");
    setButtonsBusy([btn], false);
  }
}

async function checkStatus() {
  const licenseId = document.getElementById("checkLicenseId").value.trim();
  if (!licenseId) {
    checkResult.textContent = "Informe um licenseId.";
    return;
  }
  const btn = document.getElementById("checkBtn");
  setButtonsBusy([btn], true);
  checkResult.textContent = "A verificar...";
  try {
    const response = await fetch(
      `/licenses/${encodeURIComponent(licenseId)}/status`,
    );
    const data = await response.json();
    if (data.revoked) {
      const when = data.revokedAt
        ? new Date(data.revokedAt).toLocaleString("pt-BR")
        : "—";
      checkResult.innerHTML = `<span class="badge revoked">Revogada</span> em ${escapeHtml(when)}${data.customer ? ` — ${escapeHtml(data.customer)}` : ""}${data.reason ? ` — ${escapeHtml(data.reason)}` : ""}`;
    } else {
      checkResult.innerHTML = `<span class="badge active">Não revogada</span>`;
    }
  } catch (error) {
    checkResult.textContent = error.message;
  } finally {
    setButtonsBusy([btn], false);
  }
}

document.getElementById("revokeBtn").addEventListener("click", revoke);
document.getElementById("refreshBtn").addEventListener("click", loadList);
document.getElementById("checkBtn").addEventListener("click", checkStatus);
filterInput.addEventListener("input", applyFilter);
document.getElementById("checkLicenseId").addEventListener("keydown", (e) => {
  if (e.key === "Enter") checkStatus();
});

function renderIssuedRows(issued) {
  issuedCountPill.textContent = issued.length
    ? `${issued.length} licença(s)`
    : "";
  if (!issued.length) {
    issuedTbody.innerHTML =
      '<tr><td colspan="6" class="empty">Nenhuma licença registada ainda.</td></tr>';
    return;
  }
  issuedTbody.innerHTML = "";
  const revokedIds = new Set(allRevocations.map((item) => item.licenseId));
  for (const item of issued) {
    const tr = document.createElement("tr");
    const expiresAt = item.expiresAt
      ? new Date(item.expiresAt).toLocaleDateString("pt-BR")
      : "Perpétua";
    const revoked = revokedIds.has(item.licenseId);
    const modules =
      item.modules && item.modules.length
        ? item.modules.join(", ")
        : "padrão da edição";
    tr.innerHTML = `
      <td class="mono">${escapeHtml(item.licenseId)}</td>
      <td>${escapeHtml(item.customer)}</td>
      <td>${escapeHtml(item.edition)}</td>
      <td>${escapeHtml(modules)}</td>
      <td>${escapeHtml(expiresAt)}</td>
      <td><span class="badge ${revoked ? "revoked" : "active"}">${revoked ? "Revogada" : "Ativa"}</span></td>
    `;
    issuedTbody.appendChild(tr);
  }
}

function applyIssuedFilter() {
  const term = issuedFilterInput.value.trim().toLowerCase();
  if (!term) {
    renderIssuedRows(allIssued);
    return;
  }
  const filtered = allIssued.filter((item) =>
    [item.licenseId, item.customer]
      .filter(Boolean)
      .some((field) => field.toLowerCase().includes(term)),
  );
  renderIssuedRows(filtered);
}

async function loadIssued() {
  try {
    const data = await apiFetch("/licenses/issued");
    allIssued = data.issued || [];
    applyIssuedFilter();
  } catch (error) {
    setStatus(error.message, "error");
  }
}

async function registerIssued() {
  const licenseId = document.getElementById("issuedLicenseId").value.trim();
  const installationId = document
    .getElementById("issuedInstallationId")
    .value.trim();
  const customer = document.getElementById("issuedCustomer").value.trim();
  const edition = document.getElementById("issuedEdition").value.trim();
  const expiresAtDate = document.getElementById("issuedExpiresAt").value;
  if (!licenseId || !installationId || !customer || !edition) {
    setStatus("Preencha licenseId, installationId, cliente e edição.", "error");
    return;
  }
  const btn = document.getElementById("registerIssuedBtn");
  setButtonsBusy([btn], true);
  try {
    setStatus("A registar...", "");
    await apiFetch("/licenses/issued", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        licenseId,
        installationId,
        customer,
        edition,
        issuedAt: new Date().toISOString(),
        expiresAt: expiresAtDate ? new Date(expiresAtDate).toISOString() : null,
      }),
    });
    setStatus("Licença registada com sucesso.", "ok");
    [
      "issuedLicenseId",
      "issuedInstallationId",
      "issuedCustomer",
      "issuedEdition",
      "issuedExpiresAt",
    ].forEach((id) => (document.getElementById(id).value = ""));
    loadIssued();
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    setButtonsBusy([btn], false);
  }
}

document
  .getElementById("registerIssuedBtn")
  .addEventListener("click", registerIssued);
document
  .getElementById("refreshIssuedBtn")
  .addEventListener("click", loadIssued);
issuedFilterInput.addEventListener("input", applyIssuedFilter);

if (savedToken) validateAndLoad();
