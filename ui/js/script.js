const invoke = window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke;

const CONFIG = {
  defaults: {
    resolution: "1080p",
    mic_mode: "360",
    fov: "wide",
    hdr: "off",
    horizontal_flip: "off",
    anti_flicker: "0",
    zoom_absolute: "100",
    brightness: "50",
    contrast: "50",
    saturation: "50",
    sharpness: "50",
    gamma: "100",
    hue: "0",
    auto_exposure: "3",
    exposure_time_absolute: "156",
    power_line_frequency: "2",
    focus_automatic_continuous: "on",
    focus_absolute: "0",
    white_balance_automatic: "on",
    white_balance_temperature: "4500",
  },
  dimensions: {
    "360p": { width: 640, height: 360 },
    "720p": { width: 1280, height: 720 },
    "1080p": { width: 1920, height: 1080 },
    "2k": { width: 2560, height: 1440 },
  },
  panLimits: { min: -36000, max: 36000, step: 3600 },
  tiltLimits: { min: -36000, max: 36000, step: 3600 },
};

class CameraAPI {
  constructor() {
    this.commandQueue = Promise.resolve();
  }

  queue(command, args) {
    return new Promise((resolve, reject) => {
      this.commandQueue = this.commandQueue.then(async () => {
        try {
          const res = await invoke(command, args);
          resolve(res);
        } catch (e) {
          reject(e);
        }
      });
    });
  }

  async listDevices() {
    return this.queue("list_camera_devices", {});
  }

  async setControl(devicePath, control, value) {
    return this.queue("set_camera_control", {
      device: devicePath,
      control: control,
      value: String(value),
    });
  }

  async getControl(devicePath, control) {
    return this.queue("get_camera_control", {
      device: devicePath,
      control,
    });
  }
}

class AppState {
  constructor() {
    this.deviceList = [];
    this.selectedDevice = null;
    this.activeStream = null;

    this.settings = { ...CONFIG.defaults, pan: 0, tilt: 0 };
  }

  getStorageKey(control) {
    return `c200_${this.selectedDevice?.path}_${control}`;
  }

  saveSetting(control, value) {
    if (!this.selectedDevice) return;
    localStorage.setItem(this.getStorageKey(control), String(value));
    this.settings[control] = value;
  }

  loadAllSettings() {
    if (!this.selectedDevice) return;
    Object.keys(this.settings).forEach((control) => {
      const saved = localStorage.getItem(this.getStorageKey(control));
      if (saved !== null) {
        this.settings[control] =
          control.includes("pan") || control.includes("tilt")
            ? parseInt(saved, 10) || 0
            : saved;
      }
    });
  }
}

class UIManager {
  constructor(app) {
    this.app = app;
    this.elements = {
      views: {
        devices: document.getElementById("view-devices"),
        panel: document.getElementById("view-panel"),
      },
      devices: {
        grid: document.getElementById("devices-grid"),
        empty: document.getElementById("devices-empty"),
        btnRefresh: document.getElementById("btn-refresh-devices"),
      },
      panel: {
        btnBack: document.getElementById("btn-back"),
        title: document.getElementById("panel-device-title"),
        path: document.getElementById("panel-device-path"),
        status: document.getElementById("status"),
        statusDot: document.getElementById("status-dot"),
        preview: document.getElementById("camera-preview"),
        placeholder: document.getElementById("camera-placeholder"),
        toggleSwitch: document.getElementById("toggle-camera-switch"),
        switchLabel: document.getElementById("camera-switch-label"),
      },
    };
    this.bindEvents();
  }

  switchView(viewName) {
    Object.entries(this.elements.views).forEach(([name, el]) => {
      el.classList.toggle("active", name === viewName);
    });
  }

  updateStatus(message, type = "info") {
    if (!this.elements.panel.status) return;
    this.elements.panel.status.textContent = message;
    if (this.elements.panel.statusDot) {
      this.elements.panel.statusDot.className = `status-dot ${type}`;
    }
  }

  renderDevices(devices) {
    this.elements.devices.grid.innerHTML = "";
    if (devices.length === 0) {
      this.elements.devices.empty.classList.add("visible");
      this.elements.devices.grid.style.display = "none";
      return;
    }

    this.elements.devices.empty.classList.remove("visible");
    this.elements.devices.grid.style.display = "grid";

    devices.forEach((dev) => {
      const card = document.createElement("div");
      card.className = "device-card";
      card.innerHTML = `
        <div class="device-card-media">
          <img src="./assets/c200.png" alt="${dev.name}" class="device-card-thumb" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
          <div class="device-card-fallback">📷</div>
        </div>
        <div class="device-card-body">
          <span class="device-card-name">${dev.name}</span>
          <span class="device-card-path">${dev.path}</span>
          <span class="device-card-badge">UVC Ready</span>
        </div>
      `;
      card.addEventListener("click", () => this.app.openDevicePanel(dev));
      this.elements.devices.grid.appendChild(card);
    });
  }

  applyUIValue(control, value) {
    const segmentedButtons = document.querySelectorAll(
      `[data-control="${control}"][data-action="segmented"]`,
    );
    if (segmentedButtons.length > 0) {
      segmentedButtons.forEach((btn) =>
        btn.classList.toggle("active", btn.dataset.value === String(value)),
      );
      return;
    }

    const valDisplay = document.getElementById(`val-${control}`);
    if (valDisplay) {
      valDisplay.textContent =
        control === "white_balance_temperature" ? `${value} K` : value;
    }

    const el = document.getElementById(control);
    if (!el) return;

    if (el.type === "checkbox") {
      el.checked =
        control === "auto_exposure"
          ? String(value) === "3" || value === "auto"
          : value === "on" || value === "true" || value === true;
    } else {
      el.value = value;
    }

    this.updateDependencyStates();
  }

  updateDependencyStates() {
    const dependencies = [
      { triggerId: "auto_exposure", targetId: "row-exposure_time_absolute" },
      {
        triggerId: "focus_automatic_continuous",
        targetId: "row-focus_absolute",
      },
      {
        triggerId: "white_balance_automatic",
        targetId: "row-white_balance_temperature",
      },
    ];
    dependencies.forEach(({ triggerId, targetId }) => {
      const trigger = document.getElementById(triggerId);
      const target = document.getElementById(targetId);
      if (trigger && target) {
        target.classList.toggle("row-disabled", Boolean(trigger.checked));
      }
    });
  }

  bindEvents() {
    this.elements.devices.btnRefresh.addEventListener("click", async (e) => {
      e.currentTarget.classList.add("rotating");
      await this.app.loadDevices();
      setTimeout(
        () => e.target.closest("button").classList.remove("rotating"),
        400,
      );
    });

    this.elements.panel.btnBack.addEventListener("click", () =>
      this.app.closeDevicePanel(),
    );

    if (this.elements.panel.toggleSwitch) {
      this.elements.panel.toggleSwitch.addEventListener("change", async (e) => {
        if (e.target.checked) {
          await this.app.startCamera();
          await this.app.applyCurrentFraming();
        } else {
          this.app.stopCamera();
        }
      });
    }

    document.querySelectorAll("[data-action]").forEach((element) => {
      element.addEventListener("click", (e) =>
        this.app.handleAction(e.currentTarget),
      );
    });

    document.querySelectorAll(".toggle-input").forEach((checkbox) => {
      checkbox.addEventListener("change", (e) => {
        this.app.toggleControl(e.target.dataset.control, e.target.checked);
      });
    });

    document.querySelectorAll(".range-input").forEach((range) => {
      const control = range.dataset.control;
      const display = document.getElementById(`val-${control}`);
      range.addEventListener("input", () => {
        if (display) {
          display.textContent =
            control === "white_balance_temperature"
              ? `${range.value} K`
              : range.value;
        }
      });
      range.addEventListener("change", (e) =>
        this.app.handleRangeChange(control, e.target.value),
      );
    });
  }
}

class CameraControllerApp {
  constructor() {
    this.api = new CameraAPI();
    this.state = new AppState();
    this.ui = new UIManager(this);
    if (!invoke) console.warn("Tauri environment not detected.");
  }

  init() {
    this.loadDevices();
  }

  async loadDevices() {
    try {
      const devices = await this.api.listDevices();
      this.state.deviceList = Array.isArray(devices) ? devices : [];
      this.ui.renderDevices(this.state.deviceList);
    } catch (err) {
      this.state.deviceList = [];
      this.ui.renderDevices([]);
    }
  }

  async openDevicePanel(device) {
    this.state.selectedDevice = device;
    this.ui.elements.panel.title.textContent = device.name;
    this.ui.elements.panel.path.textContent = device.path;
    this.ui.switchView("panel");
    await this.syncFromCamera();
    await this.startCamera();
    await this.applyCurrentFraming();
  }

  closeDevicePanel() {
    this.stopCamera();
    this.state.selectedDevice = null;
    this.ui.switchView("devices");
    this.loadDevices();
  }

  async startCamera() {
    try {
      this.ui.updateStatus("Conectando sensor...", "info");

      try {
        const tempStream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
        tempStream.getTracks().forEach((t) => t.stop());
      } catch (e) {}

      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter((d) => d.kind === "videoinput");
      const ankerDevices = videoDevices.filter(
        (d) =>
          d.label.toLowerCase().includes("anker") ||
          d.label.toLowerCase().includes("c200"),
      );

      let targetDeviceId = undefined;
      if (ankerDevices.length > 0 && this.state.selectedDevice) {
        const idx = this.state.deviceList.findIndex(
          (d) => d.path === this.state.selectedDevice.path,
        );
        targetDeviceId =
          idx >= 0 && idx < ankerDevices.length
            ? ankerDevices[idx].deviceId
            : ankerDevices[0].deviceId;
      } else if (videoDevices.length > 0) {
        targetDeviceId = videoDevices[0].deviceId;
      }

      const resConfig =
        CONFIG.dimensions[this.state.settings.resolution] ||
        CONFIG.dimensions["1080p"];
      const videoConstraints = {
        width: { exact: resConfig.width },
        height: { exact: resConfig.height },
      };

      if (targetDeviceId) videoConstraints.deviceId = { exact: targetDeviceId };

      try {
        this.state.activeStream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraints,
          audio: false,
        });
      } catch (err) {
        console.warn(
          "Restrições exatas falharam, tentando restrição ideal",
          err,
        );

        videoConstraints.width = { ideal: resConfig.width };
        videoConstraints.height = { ideal: resConfig.height };
        this.state.activeStream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraints,
          audio: false,
        });
      }

      this.ui.elements.panel.preview.srcObject = this.state.activeStream;
      await new Promise((resolve) => {
        this.ui.elements.panel.preview.onloadedmetadata = () => {
          this.ui.elements.panel.preview.play().then(resolve).catch(resolve);
        };
      });

      this.ui.elements.panel.placeholder.classList.remove("visible");
      if (this.ui.elements.panel.toggleSwitch)
        this.ui.elements.panel.toggleSwitch.checked = true;
      if (this.ui.elements.panel.switchLabel) {
        this.ui.elements.panel.switchLabel.textContent = "Vídeo Ativo";
        this.ui.elements.panel.switchLabel.className =
          "camera-switch-label active";
      }
      this.ui.updateStatus("Câmera ativa", "success");
      return true;
    } catch (err) {
      this.ui.updateStatus(`Erro no vídeo: ${err.message}`, "error");
      return false;
    }
  }

  stopCamera() {
    if (this.state.activeStream) {
      this.state.activeStream.getTracks().forEach((track) => track.stop());
      this.state.activeStream = null;
    }
    this.ui.elements.panel.preview.srcObject = null;
    this.ui.elements.panel.placeholder.classList.add("visible");
    if (this.ui.elements.panel.toggleSwitch)
      this.ui.elements.panel.toggleSwitch.checked = false;
    if (this.ui.elements.panel.switchLabel) {
      this.ui.elements.panel.switchLabel.textContent = "Vídeo Desativado";
      this.ui.elements.panel.switchLabel.className =
        "camera-switch-label inactive";
    }
    this.ui.updateStatus("Transmissão desativada", "info");
  }

  async setCameraControl(control, value) {
    if (!this.state.selectedDevice) {
      this.ui.updateStatus("Nenhum dispositivo ativo", "error");
      return false;
    }

    let wasStreaming = false;
    try {
      this.ui.updateStatus(`Aplicando ${control}...`, "info");

      this.state.saveSetting(control, value);

      if (control === "resolution") {
        if (this.state.activeStream) {
          wasStreaming = true;
          this.stopCamera();
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
      }

      await this.api.setControl(this.state.selectedDevice.path, control, value);

      if (control === "resolution" && wasStreaming) await this.startCamera();
      if (control === "hdr" || control === "horizontal_flip") {
        setTimeout(async () => await this.applyCurrentFraming(), 500);
      }

      this.ui.updateStatus(`${control} atualizado`, "success");
      return true;
    } catch (err) {
      if (control === "resolution" && wasStreaming) await this.startCamera();
      if (
        control === "vertical_screen" &&
        String(err).includes("No such file or directory")
      ) {
        const row = document.getElementById("row-vertical_screen");
        if (row) row.classList.add("row-unsupported");
        this.ui.updateStatus("Modo vertical não disponível", "info");
        return false;
      }
      this.ui.updateStatus(`Falha em ${control}: ${err}`, "error");
      return false;
    }
  }

  async toggleControl(control, isChecked) {
    const valToSend =
      control === "auto_exposure"
        ? isChecked
          ? "3"
          : "1"
        : isChecked
          ? "on"
          : "off";
    await this.setCameraControl(control, valToSend);
    this.ui.updateDependencyStates();
  }

  async handleRangeChange(control, value) {
    const disableAuto = async (autoControlId, controlVal) => {
      const autoToggle = document.getElementById(autoControlId);
      if (autoToggle && autoToggle.checked) {
        autoToggle.checked = false;
        await this.setCameraControl(autoControlId, controlVal);
        this.ui.updateDependencyStates();
      }
    };

    if (control === "white_balance_temperature")
      await disableAuto("white_balance_automatic", "off");
    else if (control === "exposure_time_absolute")
      await disableAuto("auto_exposure", "1");
    else if (control === "focus_absolute")
      await disableAuto("focus_automatic_continuous", "off");

    await this.setCameraControl(control, value);
  }

  async handleAction(element) {
    const action = element.dataset.action;
    const control = element.dataset.control;
    const val = element.dataset.value;

    switch (action) {
      case "segmented":
        this.ui.applyUIValue(control, val);
        if (
          control === "fov" &&
          (this.state.settings.pan !== 0 || this.state.settings.tilt !== 0)
        ) {
          await this.resetPanTilt();
          await new Promise((r) => setTimeout(r, 200));
        }
        await this.setCameraControl(control, val);
        break;
      case "reset":
        await this.resetControl(control);
        break;
      case "move":
        await this.moveCamera(
          parseInt(element.dataset.pan, 10),
          parseInt(element.dataset.tilt, 10),
        );
        break;
      case "reset-pan-tilt":
        await this.resetPanTilt();
        break;
      case "reset-all":
        await this.resetAllControls();
        break;
    }
  }

  async resetControl(control) {
    const defaultValue = CONFIG.defaults[control];
    if (defaultValue === undefined) return;
    this.ui.applyUIValue(control, defaultValue);
    await this.setCameraControl(control, defaultValue);
  }

  async resetAllControls() {
    for (const [control, value] of Object.entries(CONFIG.defaults)) {
      this.ui.applyUIValue(control, value);
      await this.setCameraControl(control, value);
    }
    await this.resetPanTilt();
  }

  clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  async moveCamera(panDir, tiltDir) {
    if (!this.state.selectedDevice) return;
    const nextPan = this.clamp(
      this.state.settings.pan + panDir * CONFIG.panLimits.step,
      CONFIG.panLimits.min,
      CONFIG.panLimits.max,
    );
    const nextTilt = this.clamp(
      this.state.settings.tilt + tiltDir * CONFIG.tiltLimits.step,
      CONFIG.tiltLimits.min,
      CONFIG.tiltLimits.max,
    );

    if (nextPan !== this.state.settings.pan) {
      await this.setCameraControl("pan_absolute", nextPan);
    }
    if (nextTilt !== this.state.settings.tilt) {
      await this.setCameraControl("tilt_absolute", nextTilt);
    }
  }

  async resetPanTilt() {
    if (!this.state.selectedDevice) return;
    await this.setCameraControl("pan_absolute", 0);
    await this.setCameraControl("tilt_absolute", 0);
  }

  async applyCurrentFraming() {
    if (this.state.settings.fov) {
      await this.setCameraControl("fov", this.state.settings.fov);
    }
    if (this.state.settings.pan !== 0 || this.state.settings.tilt !== 0) {
      await new Promise((r) => setTimeout(r, 300));
      if (this.state.settings.pan !== 0)
        await this.setCameraControl("pan_absolute", this.state.settings.pan);
      if (this.state.settings.tilt !== 0)
        await this.setCameraControl("tilt_absolute", this.state.settings.tilt);
    }
  }

  async syncFromCamera() {
    if (!this.state.selectedDevice || !invoke) return;
    this.ui.updateStatus("Sincronizando...", "info");

    this.state.loadAllSettings();

    const hardwareControls = Object.keys(CONFIG.defaults).filter(
      (c) => c !== "resolution",
    );
    hardwareControls.push("pan_absolute", "tilt_absolute");

    for (const control of hardwareControls) {
      try {
        let raw = await this.api.getControl(
          this.state.selectedDevice.path,
          control,
        );
        if (!raw) throw new Error("Vazio");
        raw = String(raw).trim();

        if (control === "fov") {
          let fovVal = "wide";
          if (raw.includes("narrow") || raw.includes("65")) fovVal = "narrow";
          else if (raw.includes("medium") || raw.includes("78"))
            fovVal = "medium";
          this.state.settings.fov = fovVal;
        } else if (control === "pan_absolute") {
          this.state.settings.pan = parseInt(raw, 10) || 0;
        } else if (control === "tilt_absolute") {
          this.state.settings.tilt = parseInt(raw, 10) || 0;
        } else {
          this.state.settings[control] = raw;
        }
      } catch {}
    }

    Object.entries(this.state.settings).forEach(([control, value]) => {
      this.ui.applyUIValue(control, value);
    });

    this.ui.updateDependencyStates();
    this.ui.updateStatus("Pronto", "success");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const app = new CameraControllerApp();
  app.init();
});
