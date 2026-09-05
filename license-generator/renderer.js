const $ = (id) => document.getElementById(id);
let generated = null;
let registryConfigured = false;

function showMessage(text, tone = "error") {
  const element = $("message");
  element.textContent = text;
  element.className = `message ${tone}`;
  element.hidden = false;
}
function unwrap(response) {
  if (!response.ok) throw new Error(response.error);
  return response.data;
}

async function refreshRegistryStatus() {
  try {
    const status = unwrap(await window.licenseGenerator.registryStatus());
    registryConfigured = status.configured;
    $("registryStatus").textContent = registryConfigured
      ? "Configurado"
      : "Não configurado";
    $("registryStatus").classList.toggle("success", registryConfigured);
  } catch (error) {
    showMessage(error.message);
  }
}
refreshRegistryStatus();

$("saveRegistryToken").addEventListener("click", async () => {
  try {
    unwrap(
      await window.licenseGenerator.registrySetToken($("registryToken").value),
    );
    $("registryToken").value = "";
    showMessage("Token guardado neste computador.", "success");
    refreshRegistryStatus();
  } catch (error) {
    showMessage(error.message);
  }
});

$("clearRegistryToken").addEventListener("click", async () => {
  try {
    unwrap(await window.licenseGenerator.registryClearToken());
    showMessage("Token removido deste computador.", "success");
    refreshRegistryStatus();
  } catch (error) {
    showMessage(error.message);
  }
});

$("selectKey").addEventListener("click", async () => {
  try {
    const result = unwrap(await window.licenseGenerator.selectKey());
    if (!result.selected) return;
    $("keyStatus").textContent = result.name;
    $("keyStatus").classList.add("success");
    $("message").hidden = true;
  } catch (error) {
    showMessage(error.message);
  }
});

$("perpetual").addEventListener("change", (event) => {
  $("days").disabled = event.target.checked;
});

function selectedModules() {
  return Array.from(
    document.querySelectorAll("#modules input[type=checkbox]:checked"),
  ).map((input) => input.value);
}

$("form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const modules = selectedModules();
    generated = unwrap(
      await window.licenseGenerator.generate({
        customer: $("customer").value,
        installationId: $("installationId").value,
        edition: $("edition").value,
        days: $("days").value,
        perpetual: $("perpetual").checked,
        modules: modules.length ? modules : undefined,
      }),
    );
    $("licenseKey").value = generated.licenseKey;
    const expiry = generated.details.expiresAt
      ? new Date(generated.details.expiresAt).toLocaleDateString("pt-BR")
      : "Perpétua";
    $("summary").innerHTML =
      `<div><span>Cliente</span><strong></strong></div><div><span>Edição</span><strong></strong></div><div><span>Validade</span><strong></strong></div><div><span>Módulos</span><strong></strong></div>`;
    const values = [
      generated.details.customer,
      generated.details.edition === "professional"
        ? "Profissional"
        : "Standard",
      expiry,
      generated.details.modules?.length
        ? generated.details.modules.join(", ")
        : `padrão da edição (${generated.details.edition === "professional" ? "todos" : "nenhum extra"})`,
    ];
    $("summary")
      .querySelectorAll("strong")
      .forEach((element, index) => {
        element.textContent = values[index];
      });
    $("result").hidden = false;
    $("message").hidden = true;
    $("result").scrollIntoView({ behavior: "smooth" });
    if (registryConfigured) registerOnline(true);
  } catch (error) {
    showMessage(error.message);
  }
});

async function registerOnline(silent = false) {
  if (!generated) return;
  try {
    unwrap(await window.licenseGenerator.registryRegister(generated.details));
    showMessage("Licença registada no painel online.", "success");
  } catch (error) {
    if (!silent) showMessage(error.message);
  }
}

$("registerOnline").addEventListener("click", () => registerOnline(false));

$("copy").addEventListener("click", async () => {
  if (!generated) return;
  try {
    unwrap(await window.licenseGenerator.copy(generated.licenseKey));
    showMessage("Chave copiada.", "success");
  } catch (error) {
    showMessage(error.message);
  }
});
$("save").addEventListener("click", async () => {
  if (!generated) return;
  try {
    const result = unwrap(
      await window.licenseGenerator.save(
        generated.licenseKey,
        generated.details.customer,
      ),
    );
    if (result.saved) showMessage(`Licença salva em ${result.path}`, "success");
  } catch (error) {
    showMessage(error.message);
  }
});
