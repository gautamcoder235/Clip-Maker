import { convertFileSrc } from "@tauri-apps/api/core";
import { AppStateManager } from "./state/app_state";
import { CanvasRenderer } from "./editor/canvas";
import { DOMOverlay } from "./editor/dom_overlay";
import { TauriService } from "./services/tauri";
import { AppConfig, ImportedAsset, RenderJob, ProjectData } from "./types";
import { SecurityManager } from "./services/security_manager";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

// DOM Elements cache
let assetListContainer: HTMLDivElement;
let clipsGridContainer: HTMLDivElement;
let jobsListContainer: HTMLDivElement;
let canvasViewport: HTMLDivElement;
let domOverlayContainer: HTMLDivElement;

// Toolbar buttons
let btnNewProject: HTMLButtonElement;
let btnOpenProject: HTMLButtonElement;
let btnSaveProject: HTMLButtonElement;
let btnUndo: HTMLButtonElement;
let btnRedo: HTMLButtonElement;
let btnClearCache: HTMLButtonElement;
let btnImport: HTMLButtonElement;
let btnPreviewClip: HTMLButtonElement;
let btnExportAll: HTMLButtonElement;
let btnCancelAll: HTMLButtonElement;

// Tab headers
let tabClipQueue: HTMLButtonElement;
let tabRenderQueue: HTMLButtonElement;
let paneClipQueue: HTMLDivElement;
let paneRenderQueue: HTMLDivElement;

// Inputs
let propPlacementX: HTMLInputElement;
let propPlacementY: HTMLInputElement;
let propPlacementW: HTMLInputElement;
let propPlacementH: HTMLInputElement;
let propAspectRatio: HTMLSelectElement;
let propCropAnchor: HTMLSelectElement;
let propResolution: HTMLSelectElement;
let propTextTemplate: HTMLInputElement;
let propFontSize: HTMLInputElement;
let propFontColor: HTMLInputElement;
let propFontFamily: HTMLSelectElement;
let propGpuAccel: HTMLInputElement;
let propIncludeAudio: HTMLInputElement;
let propClipDuration: HTMLInputElement;

// Background
let propBgMode: HTMLSelectElement;
let propBgColor: HTMLInputElement;
let btnBrowseBgImage: HTMLButtonElement;

// Text Presets
let propPresetMode: HTMLSelectElement;
let listTextPresets: HTMLSelectElement;
let btnAddPreset: HTMLButtonElement;
let btnRemovePreset: HTMLButtonElement;

// Extra Overlays
let listExtraOverlays: HTMLSelectElement;
let propExtraText: HTMLInputElement;
let propExtraFontSize: HTMLInputElement;
let propExtraFontColor: HTMLInputElement;
let propExtraFontFamily: HTMLSelectElement;
let propExtraOutline: HTMLInputElement;
let btnAddExtra: HTMLButtonElement;
let btnUpdateExtra: HTMLButtonElement;
let btnRemoveExtra: HTMLButtonElement;

// Media Overlays
let listMediaOverlays: HTMLSelectElement;
let propMediaType: HTMLSelectElement;
let btnBrowseMediaPath: HTMLButtonElement;
let propMediaLoop: HTMLSelectElement;
let propMediaChroma: HTMLInputElement;
let propMediaSimilarity: HTMLInputElement;
let propMediaBlend: HTMLInputElement;
let propMediaChromaColor: HTMLInputElement;
let btnAddMedia: HTMLButtonElement;
let btnUpdateMedia: HTMLButtonElement;
let btnRemoveMedia: HTMLButtonElement;

// Advanced
let propParallel: HTMLInputElement;
let propWorkers: HTMLInputElement;
let propSkipStart: HTMLInputElement;
let propStartClipNum: HTMLInputElement;
let propExportFrom: HTMLInputElement;
let propExportTo: HTMLInputElement;

let txtQueueStatus: HTMLSpanElement;
let selectTheme: HTMLSelectElement;
let btnUserManual: HTMLButtonElement;

// Trim Modal elements
let trimModal: HTMLDivElement;
let trimModalVideo: HTMLVideoElement;
let trimModalFilename: HTMLSpanElement;
let trimLoadingOverlay: HTMLDivElement;
let trimTimelineRange: HTMLDivElement;
let trimTimeCurrent: HTMLSpanElement;
let trimTimeDuration: HTMLSpanElement;
let trimEnabledCheckbox: HTMLInputElement;
let trimStartInput: HTMLInputElement;
let trimEndInput: HTMLInputElement;
let btnSetTrimStart: HTMLButtonElement;
let btnSetTrimEnd: HTMLButtonElement;
let btnTrimReset: HTMLButtonElement;
let btnTrimCancel: HTMLButtonElement;
let btnTrimSave: HTMLButtonElement;

// Command Palette
let commandPalette: HTMLDivElement;
let paletteSearch: HTMLInputElement;
let paletteResults: HTMLDivElement;

// Managers & Renderers
let stateManager: AppStateManager;
let canvasRenderer: CanvasRenderer;
let domOverlay: DOMOverlay;

let currentSelectedAsset: ImportedAsset | null = null;
let activeJobUis: Map<string, HTMLDivElement> = new Map();

// ── Searchable Font Picker Helper ──
function initFontPicker(pickerId: string, hiddenSelect: HTMLSelectElement, fontNames: string[]) {
  const picker = document.getElementById(pickerId);
  if (!picker) return;

  const trigger = picker.querySelector(".font-picker-trigger") as HTMLButtonElement;
  const valueSpan = picker.querySelector(".font-picker-value") as HTMLSpanElement;
  const dropdown = picker.querySelector(".font-picker-dropdown") as HTMLDivElement;
  const searchInput = picker.querySelector(".font-picker-search") as HTMLInputElement;
  const listContainer = picker.querySelector(".font-picker-list") as HTMLDivElement;

  // Set initial value from hidden select
  valueSpan.textContent = hiddenSelect.value || fontNames[0] || "Select font";
  valueSpan.style.fontFamily = hiddenSelect.value || "";

  function renderList(filter: string) {
    listContainer.innerHTML = "";
    const query = filter.toLowerCase().trim();
    const filtered = query
      ? fontNames.filter(name => name.toLowerCase().includes(query))
      : fontNames;

    if (filtered.length === 0) {
      const noResult = document.createElement("div");
      noResult.className = "font-picker-item no-results";
      noResult.textContent = "No fonts found";
      listContainer.appendChild(noResult);
      return;
    }

    filtered.forEach(name => {
      const item = document.createElement("div");
      item.className = "font-picker-item";
      if (name === hiddenSelect.value) item.classList.add("selected");
      item.textContent = name;
      item.style.fontFamily = name;
      item.addEventListener("click", () => {
        // Update hidden select and fire change
        hiddenSelect.value = name;
        hiddenSelect.dispatchEvent(new Event("change"));
        // Update trigger display
        valueSpan.textContent = name;
        valueSpan.style.fontFamily = name;
        // Close dropdown
        closePicker();
      });
      listContainer.appendChild(item);
    });
  }

  function openPicker() {
    picker!.classList.add("open");
    searchInput.value = "";
    renderList("");
    // Delay focus slightly to avoid triggering close
    requestAnimationFrame(() => searchInput.focus());
    // Scroll selected item into view
    requestAnimationFrame(() => {
      const selected = listContainer.querySelector(".selected") as HTMLElement;
      if (selected) selected.scrollIntoView({ block: "nearest" });
    });
  }

  function closePicker() {
    picker!.classList.remove("open");
    searchInput.value = "";
  }

  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    if (picker!.classList.contains("open")) {
      closePicker();
    } else {
      // Close any other open font pickers
      document.querySelectorAll(".font-picker.open").forEach(p => p.classList.remove("open"));
      openPicker();
    }
  });

  searchInput.addEventListener("input", () => {
    renderList(searchInput.value);
  });

  // Prevent dropdown clicks from closing
  dropdown.addEventListener("click", (e) => e.stopPropagation());

  // Close on outside click
  document.addEventListener("click", () => {
    if (picker!.classList.contains("open")) closePicker();
  });

  // Sync when the hidden select changes externally (e.g. preset loading)
  const observer = new MutationObserver(() => {
    valueSpan.textContent = hiddenSelect.value || fontNames[0] || "Select font";
    valueSpan.style.fontFamily = hiddenSelect.value || "";
  });
  observer.observe(hiddenSelect, { attributes: true, attributeFilter: ["value"] });

  // Also listen for change events fired programmatically
  hiddenSelect.addEventListener("change", () => {
    valueSpan.textContent = hiddenSelect.value;
    valueSpan.style.fontFamily = hiddenSelect.value;
  });
}

window.addEventListener("DOMContentLoaded", async () => {
  // Bind Cache Elements
  assetListContainer = document.querySelector("#asset-list")!;
  clipsGridContainer = document.querySelector("#timeline-clips-grid")!;
  jobsListContainer = document.querySelector("#render-jobs-list")!;
  canvasViewport = document.querySelector("#canvas-viewport")!;
  domOverlayContainer = document.querySelector("#dom-overlay-container")!;

  btnNewProject = document.querySelector("#btn-new-project")!;
  btnOpenProject = document.querySelector("#btn-open-project")!;
  btnSaveProject = document.querySelector("#btn-save-project")!;
  btnUndo = document.querySelector("#btn-undo")!;
  btnRedo = document.querySelector("#btn-redo")!;
  btnClearCache = document.querySelector("#btn-clear-cache")!;
  btnImport = document.querySelector("#btn-import")!;
  btnPreviewClip = document.querySelector("#btn-preview-clip")!;
  btnExportAll = document.querySelector("#btn-export-all")!;
  btnCancelAll = document.querySelector("#btn-cancel-all")!;

  tabClipQueue = document.querySelector("#tab-clip-queue")!;
  tabRenderQueue = document.querySelector("#tab-render-queue")!;
  paneClipQueue = document.querySelector("#pane-clip-queue")!;
  paneRenderQueue = document.querySelector("#pane-render-queue")!;

  propPlacementX = document.querySelector("#prop-placement-x")!;
  propPlacementY = document.querySelector("#prop-placement-y")!;
  propPlacementW = document.querySelector("#prop-placement-w")!;
  propPlacementH = document.querySelector("#prop-placement-h")!;
  propAspectRatio = document.querySelector("#prop-aspect-ratio")!;
  propCropAnchor = document.querySelector("#prop-crop-anchor")!;
  propResolution = document.querySelector("#prop-resolution")!;
  propTextTemplate = document.querySelector("#prop-text-template")!;
  propFontSize = document.querySelector("#prop-font-size")!;
  propFontColor = document.querySelector("#prop-font-color")!;
  propFontFamily = document.querySelector("#prop-font-family")!;
  propGpuAccel = document.querySelector("#prop-gpu-accel")!;
  propIncludeAudio = document.querySelector("#prop-include-audio")!;
  propClipDuration = document.querySelector("#prop-clip-duration")!;

  propBgMode = document.querySelector("#prop-bg-mode")!;
  propBgColor = document.querySelector("#prop-bg-color")!;
  btnBrowseBgImage = document.querySelector("#btn-browse-bg-image")!;

  propPresetMode = document.querySelector("#prop-preset-mode")!;
  listTextPresets = document.querySelector("#list-text-presets")!;
  btnAddPreset = document.querySelector("#btn-add-preset")!;
  btnRemovePreset = document.querySelector("#btn-remove-preset")!;

  listExtraOverlays = document.querySelector("#list-extra-overlays")!;
  propExtraText = document.querySelector("#prop-extra-text")!;
  propExtraFontSize = document.querySelector("#prop-extra-font-size")!;
  propExtraFontColor = document.querySelector("#prop-extra-font-color")!;
  propExtraFontFamily = document.querySelector("#prop-extra-font-family")!;
  propExtraOutline = document.querySelector("#prop-extra-outline")!;
  btnAddExtra = document.querySelector("#btn-add-extra")!;
  btnUpdateExtra = document.querySelector("#btn-update-extra")!;
  btnRemoveExtra = document.querySelector("#btn-remove-extra")!;

  listMediaOverlays = document.querySelector("#list-media-overlays")!;
  propMediaType = document.querySelector("#prop-media-type")!;
  btnBrowseMediaPath = document.querySelector("#btn-browse-media-path")!;
  propMediaLoop = document.querySelector("#prop-media-loop")!;
  propMediaChroma = document.querySelector("#prop-media-chroma")!;
  propMediaSimilarity = document.querySelector("#prop-media-similarity")!;
  propMediaBlend = document.querySelector("#prop-media-blend")!;
  propMediaChromaColor = document.querySelector("#prop-media-chroma-color")!;
  btnAddMedia = document.querySelector("#btn-add-media")!;
  btnUpdateMedia = document.querySelector("#btn-update-media")!;
  btnRemoveMedia = document.querySelector("#btn-remove-media")!;

  propParallel = document.querySelector("#prop-parallel")!;
  propWorkers = document.querySelector("#prop-workers")!;
  propSkipStart = document.querySelector("#prop-skip-start")!;
  propStartClipNum = document.querySelector("#prop-start-clip-num")!;
  propExportFrom = document.querySelector("#prop-export-from")!;
  propExportTo = document.querySelector("#prop-export-to")!;

  txtQueueStatus = document.querySelector("#txt-queue-status")!;
  selectTheme = document.querySelector("#select-theme")!;
  btnUserManual = document.querySelector("#btn-user-manual")!;

  commandPalette = document.querySelector("#command-palette")!;
  paletteSearch = document.querySelector("#palette-search")!;
  paletteResults = document.querySelector("#palette-results")!;

  // Bind Trim Modal elements
  trimModal = document.querySelector("#trim-modal")!;
  trimModalVideo = document.querySelector("#trim-modal-video")!;
  trimModalFilename = document.querySelector("#trim-modal-filename")!;
  trimLoadingOverlay = document.querySelector("#trim-loading-overlay")!;
  trimTimelineRange = document.querySelector("#trim-timeline-range")!;
  trimTimeCurrent = document.querySelector("#trim-time-current")!;
  trimTimeDuration = document.querySelector("#trim-time-duration")!;
  trimEnabledCheckbox = document.querySelector("#trim-enabled-checkbox")!;
  trimStartInput = document.querySelector("#trim-start-input")!;
  trimEndInput = document.querySelector("#trim-end-input")!;
  btnSetTrimStart = document.querySelector("#btn-set-trim-start")!;
  btnSetTrimEnd = document.querySelector("#btn-set-trim-end")!;
  btnTrimReset = document.querySelector("#trim-reset")!;
  btnTrimCancel = document.querySelector("#trim-cancel")!;
  btnTrimSave = document.querySelector("#trim-save")!;

  // Initialize Services
  stateManager = new AppStateManager();
  await stateManager.init();

  canvasRenderer = new CanvasRenderer(canvasViewport);
  domOverlay = new DOMOverlay(domOverlayContainer, stateManager);

  // Load fonts into hidden selects (for compatibility)
  stateManager.fonts.forEach((font) => {
    const opt1 = document.createElement("option");
    opt1.value = font.name;
    opt1.innerText = font.name;
    opt1.style.fontFamily = font.name;
    if (font.name === stateManager.project.text_settings.font_family) {
      opt1.selected = true;
    }
    propFontFamily.appendChild(opt1);

    const opt2 = document.createElement("option");
    opt2.value = font.name;
    opt2.innerText = font.name;
    opt2.style.fontFamily = font.name;
    propExtraFontFamily.appendChild(opt2);
  });

  // Initialize searchable font pickers
  initFontPicker("font-picker-primary", propFontFamily, stateManager.fonts.map(f => f.name));
  initFontPicker("font-picker-extra", propExtraFontFamily, stateManager.fonts.map(f => f.name));

  // Populate config settings on ui
  syncConfigToUi();

  // Load and apply saved theme
  const savedTheme = localStorage.getItem("clip-maker-theme") || "dark-obsidian";
  selectTheme.value = savedTheme;
  document.body.className = `theme-${savedTheme}`;

  selectTheme.addEventListener("change", () => {
    const selected = selectTheme.value;
    document.body.className = `theme-${selected}`;
    localStorage.setItem("clip-maker-theme", selected);
    showToast(`Switched theme to ${selectTheme.options[selectTheme.selectedIndex].text}`, "success");
  });

  // User Manual Setup
  const userManualModal = document.getElementById("user-manual-modal")!;
  const manualClose = document.getElementById("manual-close")!;
  const manualDoneBtn = document.getElementById("manual-done-btn")!;
  const manualTabBtns = document.querySelectorAll(".manual-tab-btn");
  const manualTabContents = document.querySelectorAll(".manual-tab-content");

  btnUserManual.addEventListener("click", () => {
    userManualModal.style.display = "flex";
  });

  const closeManual = () => {
    userManualModal.style.display = "none";
  };

  manualClose.addEventListener("click", closeManual);
  manualDoneBtn.addEventListener("click", closeManual);

  userManualModal.addEventListener("click", (e) => {
    if (e.target === userManualModal) {
      closeManual();
    }
  });

  manualTabBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      manualTabBtns.forEach((b) => b.classList.remove("active"));
      manualTabContents.forEach((c) => c.classList.remove("active"));
      btn.classList.add("active");
      const targetId = btn.getAttribute("data-tab")!;
      document.getElementById(targetId)!.classList.add("active");
    });
  });

  // Resize listener
  window.addEventListener("resize", () => {
    refreshViewport();
  });

  // State changes listener
  stateManager.subscribe(() => {
    syncConfigToUi();
    
    // Refresh asset list display on state change (e.g. undo/redo of trim settings)
    const activeScroll = assetListContainer.scrollTop;
    assetListContainer.innerHTML = "";
    stateManager.assets.forEach(a => appendAssetCard(a));
    assetListContainer.scrollTop = activeScroll;

    // Refresh clip timeline parts count
    rebuildClipTimeline();

    refreshViewport();
  });

  // Event handlers
  btnImport.addEventListener("click", triggerImport);
  btnPreviewClip.addEventListener("click", generatePreview);
  btnExportAll.addEventListener("click", startBatchExport);
  btnCancelAll.addEventListener("click", cancelAllRenders);
  btnClearCache.addEventListener("click", clearCacheDir);

  btnUndo.addEventListener("click", () => stateManager.history.undo());
  btnRedo.addEventListener("click", () => stateManager.history.redo());

  btnNewProject.addEventListener("click", async () => {
    const confirmed = await showModal({
      title: "New Project",
      message: "Are you sure you want to start a new project? All unsaved changes will be lost.",
      icon: "🗑️",
      confirmText: "New Project",
      cancelText: "Keep Working",
      danger: true,
    });
    if (!confirmed) return;
    
    stateManager.project = stateManager.createDefaultProject();
    stateManager.history.clear();
    currentSelectedAsset = null;
    assetListContainer.innerHTML = "";
    clipsGridContainer.innerHTML = "";
    
    canvasRenderer.clearVideo();
    stateManager.updateProjectDirectly(stateManager.project);
    toggleDashboard(true);
    showToast("Started a new empty project session.", "success");
  });

  btnOpenProject.addEventListener("click", async () => {
    try {
      const path = await invoke<string>("select_project_file", { mode: "open" });
      if (!path || path.trim() === "") return;
      
      showToast("Loading project file...", "success");
      const projectData = await invoke<ProjectData>("load_project", { filePath: path });
      stateManager.updateProjectDirectly(projectData);
      stateManager.history.clear();
      
      // Load assets asynchronously
      assetListContainer.innerHTML = "";
      stateManager.assets = [];
      
      const importedAssets = projectData.imported_assets || [];
      if (importedAssets.length === 0 && projectData.imported_videos && projectData.imported_videos.length > 0) {
        projectData.imported_videos.forEach((videoPath, idx) => {
          importedAssets.push({
            id: `asset_legacy_${idx}_${Date.now()}`,
            path: videoPath
          });
        });
        projectData.imported_assets = importedAssets;
      }

      if (importedAssets.length > 0) {
        for (const prjAsset of importedAssets) {
          try {
            const asset = await TauriService.importFile(prjAsset.path);
            asset.id = prjAsset.id; // Assign stable loaded ID
            stateManager.assets.push(asset);
            appendAssetCard(asset);
          } catch (e) {
            console.error("Failed to import asset during project load:", prjAsset.path, e);
          }
        }
        if (stateManager.assets.length > 0) {
          selectAsset(stateManager.assets[0]);
        } else {
          toggleDashboard(true);
        }
      } else {
        toggleDashboard(true);
      }
      
      showToast("Project loaded successfully!", "success");
    } catch (err) {
      showToast(`Load failed: ${err}`, "error");
    }
  });

  btnSaveProject.addEventListener("click", async () => {
    try {
      const path = await invoke<string>("select_project_file", { mode: "save" });
      if (!path || path.trim() === "") return;
      
      showToast("Saving project file...", "success");
      stateManager.project.imported_videos = stateManager.assets.map(a => a.path);
      stateManager.project.imported_assets = stateManager.assets.map(a => ({ id: a.id, path: a.path }));
      await invoke("save_project", { filePath: path, project: stateManager.project });
      showToast("Project saved successfully!", "success");
    } catch (err) {
      showToast(`Save failed: ${err}`, "error");
    }
  });

  tabClipQueue.addEventListener("click", () => switchBottomTab("clips"));
  tabRenderQueue.addEventListener("click", () => switchBottomTab("render"));

  // Input changes bindings
  bindInputFields();

  // Overlay movements updater
  domOverlay.onLayoutChange(() => {
    propPlacementX.value = stateManager.project.video_placement.x.toString();
    propPlacementY.value = stateManager.project.video_placement.y.toString();
    propPlacementW.value = stateManager.project.video_placement.width.toString();
    propPlacementH.value = stateManager.project.video_placement.height.toString();
    propFontSize.value = stateManager.project.text_settings.font_size.toString();
  });

  // Hotkeys & Webview Security Filter
  SecurityManager.init(stateManager, toggleCommandPalette);

  // Setup Command Palette options
  setupCommandPalette();

  // Start event listeners for progress notifications
  setupTauriEventListeners();

  // Initialize draggable splitter workspace panel resizers
  setupWorkspaceResizers();

  // Initialize floating video playback controller
  setupPlaybackControls();

  // Initialize Startup Onboarding Dashboard
  setupDashboard();

  // Initialize Custom Color Picker triggers
  const customColorPicker = new CustomColorPicker();
  document.querySelectorAll(".color-picker-wrapper").forEach((wrapper) => {
    const trigger = wrapper.querySelector(".color-preview-btn") as HTMLButtonElement;
    const hiddenInput = wrapper.querySelector("input[type='color']") as HTMLInputElement;
    if (trigger && hiddenInput) {
      trigger.style.backgroundColor = hiddenInput.value;
      trigger.addEventListener("click", (e) => {
        e.preventDefault();
        customColorPicker.open(trigger, hiddenInput);
      });
    }
  });

  // Listen for clicks outside overlay boxes or the property panel to clear selection focus
  document.addEventListener("mousedown", (e) => {
    const target = e.target as HTMLElement;
    if (!target.closest(".editor-interactive-box") && !target.closest("#right-panel") && !target.closest(".playback-controls")) {
      domOverlay.setFocusedElement(null);
    }
  });

  refreshViewport();
  showToast("Clip Maker successfully initialized!", "success");

  // Start with onboarding dashboard visible
  toggleDashboard(true);

  // Splash Screen Intro Animation sequence
  const splashText = document.querySelector(".splash-loading-text");
  if (splashText) {
    setTimeout(() => { splashText.textContent = "Loading system presets..."; }, 400);
    setTimeout(() => { splashText.textContent = "Checking GPU hardware acceleration..."; }, 800);
    setTimeout(() => { splashText.textContent = "Initializing workspace layers..."; }, 1200);
    setTimeout(() => { splashText.textContent = "Creative engine ready!"; }, 1600);
  }

  setTimeout(() => {
    const splash = document.getElementById("app-splash-screen");
    if (splash) {
      splash.classList.add("fade-out");
      setTimeout(() => splash.remove(), 500);
    }
  }, 1900);

  // Custom Window Titlebar Controls Bindings
  const appWindow = getCurrentWindow();
  document.getElementById("titlebar-minimize")?.addEventListener("click", () => {
    appWindow.minimize();
  });
  document.getElementById("titlebar-maximize")?.addEventListener("click", () => {
    appWindow.toggleMaximize();
  });
  document.getElementById("titlebar-close")?.addEventListener("click", () => {
    appWindow.close();
  });
  document.getElementById("btn-welcome-import")?.addEventListener("click", triggerImport);
});

function syncConfigToUi() {
  const proj = stateManager.project;
  
  btnUndo.disabled = !stateManager.history.canUndo();
  btnRedo.disabled = !stateManager.history.canRedo();

  propPlacementX.value = proj.video_placement.x.toString();
  propPlacementY.value = proj.video_placement.y.toString();
  propPlacementW.value = proj.video_placement.width.toString();
  propPlacementH.value = proj.video_placement.height.toString();

  propAspectRatio.value = proj.aspect_ratio;
  propCropAnchor.value = proj.crop_anchor;
  propResolution.value = proj.output_resolution;
  propTextTemplate.value = proj.text_template;
  propFontSize.value = proj.text_settings.font_size.toString();
  propFontColor.value = proj.text_settings.font_color;
  propFontFamily.value = proj.text_settings.font_family;
  propFontFamily.style.fontFamily = proj.text_settings.font_family;
  // Sync font picker display (without dispatching change to avoid infinite loop)
  const primaryPickerValue = document.querySelector("#font-picker-primary .font-picker-value") as HTMLSpanElement;
  if (primaryPickerValue) {
    primaryPickerValue.textContent = proj.text_settings.font_family;
    primaryPickerValue.style.fontFamily = proj.text_settings.font_family;
  }
  
  propGpuAccel.checked = proj.gpu_acceleration;
  propIncludeAudio.checked = proj.include_audio;
  propClipDuration.value = proj.clip_duration.toString();

  // Background Settings Parity Sync
  if (proj.background) {
    propBgMode.value = proj.background.mode || "color";
    propBgColor.value = proj.background.color || "#000000";
  }

  propPresetMode.value = proj.text_preset_mode || "Single";
  propParallel.checked = proj.parallel_processing !== false;
  propWorkers.value = (proj.parallel_workers || 2).toString();
  propSkipStart.value = (proj.start_offset || 0).toString();
  propStartClipNum.value = (proj.start_clip || 1).toString();

  // Sync Lists
  syncPresetsList();
  syncExtraOverlaysList();
  syncMediaOverlaysList();
  syncColorPreviewButtons();
}

function syncPresetsList() {
  const currentVal = listTextPresets.value;
  listTextPresets.innerHTML = "";
  const presets = stateManager.project.text_presets || [];
  presets.forEach((preset, idx) => {
    const opt = document.createElement("option");
    opt.value = idx.toString();
    opt.innerText = `${preset.name || `Preset ${idx + 1}`} (${preset.font_family}, ${preset.font_size}px)`;
    listTextPresets.appendChild(opt);
  });
  if (currentVal && listTextPresets.querySelector(`option[value="${currentVal}"]`)) {
    listTextPresets.value = currentVal;
  }
}

function syncExtraOverlaysList() {
  const currentVal = listExtraOverlays.value;
  listExtraOverlays.innerHTML = "";
  const overlays = stateManager.project.extra_overlays || [];
  overlays.forEach((overlay, idx) => {
    const opt = document.createElement("option");
    opt.value = idx.toString();
    const txtSnippet = overlay.text.length > 15 ? overlay.text.substring(0, 15) + "..." : overlay.text;
    opt.innerText = `${overlay.name || `Overlay ${idx + 1}`} ("${txtSnippet}")`;
    listExtraOverlays.appendChild(opt);
  });
  if (currentVal && listExtraOverlays.querySelector(`option[value="${currentVal}"]`)) {
    listExtraOverlays.value = currentVal;
  }
}

function syncMediaOverlaysList() {
  const currentVal = listMediaOverlays.value;
  listMediaOverlays.innerHTML = "";
  const overlays = stateManager.project.media_overlays || [];
  overlays.forEach((overlay, idx) => {
    const opt = document.createElement("option");
    opt.value = idx.toString();
    const file = overlay.path.split(/[/\\]/).pop() || "None";
    opt.innerText = `${overlay.name || `Media ${idx + 1}`} (${overlay.type}: ${file})`;
    listMediaOverlays.appendChild(opt);
  });
  if (currentVal && listMediaOverlays.querySelector(`option[value="${currentVal}"]`)) {
    listMediaOverlays.value = currentVal;
  }
}

function refreshViewport() {
  const previewArea = document.getElementById("preview-area-16-9")!;
  const centerPanel = previewArea.parentElement!;
  const containerW = centerPanel.clientWidth - 40;
  const containerH = centerPanel.clientHeight - 40;
  
  // Calculate a strict 16:9 aspect-ratio box that fits inside the center panel
  const ratio = 16 / 9;
  let previewW = containerW;
  let previewH = containerW / ratio;
  if (previewH > containerH) {
    previewH = containerH;
    previewW = containerH * ratio;
  }

  // Size and center the 16:9 preview monitor wrapper
  previewArea.style.width = `${previewW}px`;
  previewArea.style.height = `${previewH}px`;
  previewArea.style.left = `${(centerPanel.clientWidth - previewW) / 2}px`;
  previewArea.style.top = `${(centerPanel.clientHeight - previewH) / 2}px`;

  // Draw and fit the actual video project canvas inside the 16:9 container
  canvasRenderer.updateLayout(stateManager.project, previewW, previewH);
  
  const finalW = parseFloat(canvasViewport.style.width);
  const finalH = parseFloat(canvasViewport.style.height);
  const finalLeft = parseFloat(canvasViewport.style.left) || 0;
  const finalTop = parseFloat(canvasViewport.style.top) || 0;

  // Position the overlay container exactly over the canvas viewport area
  const overlayContainer = document.getElementById("dom-overlay-container")!;
  overlayContainer.style.width = `${finalW}px`;
  overlayContainer.style.height = `${finalH}px`;
  overlayContainer.style.left = `${finalLeft}px`;
  overlayContainer.style.top = `${finalTop}px`;
  overlayContainer.style.position = "absolute";

  domOverlay.update(stateManager.project, finalW, finalH);
}

function updateResolutionAndAspectRatio(trigger: "ratio" | "res") {
  if (trigger === "ratio") {
    const ratio = propAspectRatio.value;
    if (ratio === "9:16") {
      propResolution.value = "1080x1920 (Shorts)";
    } else if (ratio === "16:9") {
      propResolution.value = "1920x1080";
    } else {
      propResolution.value = "Source";
    }
  } else {
    const res = propResolution.value;
    if (res === "Source") {
      propAspectRatio.value = "original";
    } else if (res.includes("1920x1080") || res.includes("1280x720")) {
      propAspectRatio.value = "16:9";
    } else {
      propAspectRatio.value = "9:16";
    }
  }

  // Update width / height in project state
  const resolution = propResolution.value;
  stateManager.project.output_resolution = resolution;
  stateManager.project.aspect_ratio = propAspectRatio.value;

  if (resolution === "Source") {
    if (currentSelectedAsset && currentSelectedAsset.metadata) {
      stateManager.project.output_width = currentSelectedAsset.metadata.width;
      stateManager.project.output_height = currentSelectedAsset.metadata.height;
    } else {
      // default fallback
      stateManager.project.output_width = 1080;
      stateManager.project.output_height = 1920;
    }
  } else if (resolution.startsWith("1080x1920")) {
    stateManager.project.output_width = 1080;
    stateManager.project.output_height = 1920;
  } else if (resolution.startsWith("720x1280")) {
    stateManager.project.output_width = 720;
    stateManager.project.output_height = 1280;
  } else if (resolution.startsWith("1920x1080")) {
    stateManager.project.output_width = 1920;
    stateManager.project.output_height = 1080;
  } else if (resolution.startsWith("1280x720")) {
    stateManager.project.output_width = 1280;
    stateManager.project.output_height = 720;
  }

  stateManager.updateProjectDirectly(stateManager.project);
}

function bindInputFields() {
  propPlacementX.addEventListener("change", () => {
    const val = parseInt(propPlacementX.value) || 0;
    const placement = { ...stateManager.project.video_placement, x: val };
    stateManager.updateProjectField("video_placement", placement);
  });
  propPlacementY.addEventListener("change", () => {
    const val = parseInt(propPlacementY.value) || 0;
    const placement = { ...stateManager.project.video_placement, y: val };
    stateManager.updateProjectField("video_placement", placement);
  });
  propPlacementW.addEventListener("change", () => {
    const val = parseInt(propPlacementW.value) || 1080;
    const placement = { ...stateManager.project.video_placement, width: val };
    stateManager.updateProjectField("video_placement", placement);
  });
  propPlacementH.addEventListener("change", () => {
    const val = parseInt(propPlacementH.value) || 1920;
    const placement = { ...stateManager.project.video_placement, height: val };
    stateManager.updateProjectField("video_placement", placement);
  });

  propAspectRatio.addEventListener("change", () => {
    updateResolutionAndAspectRatio("ratio");
  });
  propCropAnchor.addEventListener("change", () => {
    stateManager.updateProjectField("crop_anchor", propCropAnchor.value);
  });
  propResolution.addEventListener("change", () => {
    updateResolutionAndAspectRatio("res");
  });
  
  propTextTemplate.addEventListener("change", () => {
    stateManager.updateProjectField("text_template", propTextTemplate.value);
  });

  propFontSize.addEventListener("change", () => {
    const val = parseInt(propFontSize.value) || 24;
    const textSettings = { ...stateManager.project.text_settings, font_size: val };
    stateManager.updateProjectField("text_settings", textSettings);
  });

  propFontColor.addEventListener("change", () => {
    const textSettings = { ...stateManager.project.text_settings, font_color: propFontColor.value };
    stateManager.updateProjectField("text_settings", textSettings);
  });

  propFontFamily.addEventListener("change", () => {
    const textSettings = { ...stateManager.project.text_settings, font_family: propFontFamily.value };
    stateManager.updateProjectField("text_settings", textSettings);
  });

  propGpuAccel.addEventListener("change", () => {
    stateManager.updateProjectField("gpu_acceleration", propGpuAccel.checked);
  });

  propIncludeAudio.addEventListener("change", () => {
    stateManager.updateProjectField("include_audio", propIncludeAudio.checked);
  });

  propClipDuration.addEventListener("change", () => {
    const val = parseInt(propClipDuration.value) || 60;
    stateManager.updateProjectField("clip_duration", val);
    rebuildClipTimeline();
  });

  // Background modes
  propBgMode.addEventListener("change", () => {
    const bg = { ...stateManager.project.background, mode: propBgMode.value };
    stateManager.updateProjectField("background", bg);
    refreshViewport();
  });
  propBgColor.addEventListener("change", () => {
    const bg = { ...stateManager.project.background, color: propBgColor.value };
    stateManager.updateProjectField("background", bg);
    refreshViewport();
  });
  btnBrowseBgImage.addEventListener("click", async () => {
    try {
      const path = await invoke<string>("select_video_file");
      if (!path) return;
      const bg = { ...stateManager.project.background, image_path: path };
      stateManager.updateProjectField("background", bg);
      showToast(`Background image set to: ${path.split(/[/\\]/).pop()}`, "success");
      refreshViewport();
    } catch (err) {
      showToast(`Image browse failed: ${err}`, "error");
    }
  });

  // Text Presets
  propPresetMode.addEventListener("change", () => {
    stateManager.updateProjectField("text_preset_mode", propPresetMode.value);
  });
  listTextPresets.addEventListener("change", () => {
    const idx = parseInt(listTextPresets.value);
    const presets = stateManager.project.text_presets || [];
    const preset = presets[idx];
    if (preset) {
      propFontSize.value = preset.font_size.toString();
      propFontColor.value = preset.font_color;
      propFontFamily.value = preset.font_family;
      // Sync font picker display
      const pv = document.querySelector("#font-picker-primary .font-picker-value") as HTMLSpanElement;
      if (pv) { pv.textContent = preset.font_family; pv.style.fontFamily = preset.font_family; }
      
      const settings = {
        ...stateManager.project.text_settings,
        font_size: preset.font_size,
        font_color: preset.font_color,
        font_family: preset.font_family,
        outline: preset.outline
      };
      stateManager.updateProjectField("text_settings", settings);
      refreshViewport();
    }
  });
  btnAddPreset.addEventListener("click", () => {
    const presets = [...(stateManager.project.text_presets || [])];
    const currentSettings = stateManager.project.text_settings;
    presets.push({
      name: `Preset ${presets.length + 1}`,
      font_size: currentSettings.font_size,
      font_color: currentSettings.font_color,
      font_family: currentSettings.font_family,
      outline: currentSettings.outline,
      placement: currentSettings.placement || "Custom",
      x_position: currentSettings.x_position,
      y_position: currentSettings.y_position
    });
    stateManager.updateProjectField("text_presets", presets);
    syncPresetsList();
    showToast("Added new text preset!", "success");
  });
  btnRemovePreset.addEventListener("click", () => {
    const idx = parseInt(listTextPresets.value);
    if (isNaN(idx)) return;
    const presets = [...(stateManager.project.text_presets || [])];
    presets.splice(idx, 1);
    stateManager.updateProjectField("text_presets", presets);
    syncPresetsList();
    showToast("Removed text preset", "warning");
  });

  // Extra Text Overlays
  listExtraOverlays.addEventListener("change", () => {
    const idx = parseInt(listExtraOverlays.value);
    const overlays = stateManager.project.extra_overlays || [];
    const overlay = overlays[idx];
    if (overlay) {
      propExtraText.value = overlay.text;
      propExtraFontSize.value = overlay.font_size.toString();
      propExtraFontColor.value = overlay.font_color;
      propExtraFontFamily.value = overlay.font_family;
      propExtraFontFamily.style.fontFamily = overlay.font_family;
      // Sync extra font picker display
      const extraPickerValue = document.querySelector("#font-picker-extra .font-picker-value") as HTMLSpanElement;
      if (extraPickerValue) {
        extraPickerValue.textContent = overlay.font_family;
        extraPickerValue.style.fontFamily = overlay.font_family;
      }
      propExtraOutline.checked = overlay.outline;
      domOverlay.setFocusedElement(`extra-${idx}`);
      syncColorPreviewButtons();
    }
  });
  btnAddExtra.addEventListener("click", () => {
    const overlays = [...(stateManager.project.extra_overlays || [])];
    overlays.push({
      name: `Overlay ${overlays.length + 1}`,
      text: propExtraText.value || "NEW OVERLAY",
      placement: "Custom",
      x_position: "100",
      y_position: "300",
      font_size: parseInt(propExtraFontSize.value) || 80,
      font_color: propExtraFontColor.value || "#ffffff",
      font_family: propExtraFontFamily.value || "Arial",
      outline: propExtraOutline.checked
    });
    stateManager.updateProjectField("extra_overlays", overlays);
    syncExtraOverlaysList();
    refreshViewport();
    showToast("Added extra text overlay!", "success");
  });
  btnUpdateExtra.addEventListener("click", () => {
    const idx = parseInt(listExtraOverlays.value);
    if (isNaN(idx)) {
      showToast("Select an extra overlay to update first!", "warning");
      return;
    }
    const overlays = [...(stateManager.project.extra_overlays || [])];
    if (overlays[idx]) {
      overlays[idx].text = propExtraText.value || overlays[idx].text;
      overlays[idx].font_size = parseInt(propExtraFontSize.value) || 80;
      overlays[idx].font_color = propExtraFontColor.value;
      overlays[idx].font_family = propExtraFontFamily.value;
      overlays[idx].outline = propExtraOutline.checked;
      stateManager.updateProjectField("extra_overlays", overlays);
      syncExtraOverlaysList();
      refreshViewport();
      showToast("Updated extra overlay settings!", "success");
    }
  });
  btnRemoveExtra.addEventListener("click", () => {
    const idx = parseInt(listExtraOverlays.value);
    if (isNaN(idx)) return;
    const overlays = [...(stateManager.project.extra_overlays || [])];
    overlays.splice(idx, 1);
    stateManager.updateProjectField("extra_overlays", overlays);
    syncExtraOverlaysList();
    refreshViewport();
    showToast("Deleted extra text overlay", "warning");
  });

  // Media Overlays
  let selectedMediaPath = "";
  listMediaOverlays.addEventListener("change", () => {
    const idx = parseInt(listMediaOverlays.value);
    const overlays = stateManager.project.media_overlays || [];
    const overlay = overlays[idx];
    if (overlay) {
      propMediaType.value = overlay.type;
      selectedMediaPath = overlay.path;
      btnBrowseMediaPath.innerText = overlay.path.split(/[/\\]/).pop() || "Select file";
      propMediaLoop.value = overlay.loop_mode || "repeat";
      propMediaChroma.checked = overlay.chroma_key;
      propMediaSimilarity.value = overlay.chroma_similarity.toString();
      propMediaBlend.value = overlay.chroma_blend.toString();
      propMediaChromaColor.value = overlay.chroma_color || "#00ff00";
      domOverlay.setFocusedElement(`media-${idx}`);
      syncColorPreviewButtons();
    }
  });
  btnBrowseMediaPath.addEventListener("click", async () => {
    try {
      const path = await invoke<string>("select_video_file");
      if (!path) return;
      selectedMediaPath = path;
      btnBrowseMediaPath.innerText = path.split(/[/\\]/).pop() || "Select file";
    } catch (err) {
      showToast(`Browse failed: ${err}`, "error");
    }
  });
  btnAddMedia.addEventListener("click", () => {
    if (!selectedMediaPath) {
      showToast("Browse and select a media file first!", "warning");
      return;
    }
    const overlays = [...(stateManager.project.media_overlays || [])];
    overlays.push({
      name: `Media ${overlays.length + 1}`,
      type: propMediaType.value,
      path: selectedMediaPath,
      x: 100,
      y: 200,
      width: 400,
      height: 240,
      enabled: true,
      loop_mode: propMediaLoop.value,
      chroma_key: propMediaChroma.checked,
      chroma_color: propMediaChromaColor.value || "#00ff00",
      chroma_similarity: parseFloat(propMediaSimilarity.value) || 0.3,
      chroma_blend: parseFloat(propMediaBlend.value) || 0.05
    });
    stateManager.updateProjectField("media_overlays", overlays);
    syncMediaOverlaysList();
    refreshViewport();
    showToast("Added media overlay!", "success");
  });
  btnUpdateMedia.addEventListener("click", () => {
    const idx = parseInt(listMediaOverlays.value);
    if (isNaN(idx)) {
      showToast("Select a media overlay to update first!", "warning");
      return;
    }
    const overlays = [...(stateManager.project.media_overlays || [])];
    if (overlays[idx]) {
      overlays[idx].type = propMediaType.value;
      overlays[idx].path = selectedMediaPath || overlays[idx].path;
      overlays[idx].loop_mode = propMediaLoop.value;
      overlays[idx].chroma_key = propMediaChroma.checked;
      overlays[idx].chroma_color = propMediaChromaColor.value;
      overlays[idx].chroma_similarity = parseFloat(propMediaSimilarity.value) || 0.3;
      overlays[idx].chroma_blend = parseFloat(propMediaBlend.value) || 0.05;
      
      stateManager.updateProjectField("media_overlays", overlays);
      syncMediaOverlaysList();
      refreshViewport();
      showToast("Updated media overlay settings!", "success");
    }
  });
  btnRemoveMedia.addEventListener("click", () => {
    const idx = parseInt(listMediaOverlays.value);
    if (isNaN(idx)) return;
    const overlays = [...(stateManager.project.media_overlays || [])];
    overlays.splice(idx, 1);
    stateManager.updateProjectField("media_overlays", overlays);
    syncMediaOverlaysList();
    refreshViewport();
    showToast("Deleted media overlay", "warning");
  });

  // Advanced & Skip Start bindings
  propParallel.addEventListener("change", () => {
    stateManager.updateProjectField("parallel_processing", propParallel.checked);
  });
  propWorkers.addEventListener("change", () => {
    stateManager.updateProjectField("parallel_workers", parseInt(propWorkers.value) || 2);
  });
  propSkipStart.addEventListener("change", () => {
    stateManager.updateProjectField("start_offset", parseInt(propSkipStart.value) || 0);
  });
  propStartClipNum.addEventListener("change", () => {
    stateManager.updateProjectField("start_clip", parseInt(propStartClipNum.value) || 1);
  });
  

  // Focus video overlay when interacting with placement settings in inspector
  const videoInputs = [propPlacementX, propPlacementY, propPlacementW, propPlacementH, propAspectRatio, propCropAnchor, propResolution];
  videoInputs.forEach(input => {
    input.addEventListener("focus", () => domOverlay.setFocusedElement("video"));
  });

  // Focus text overlay when interacting with text settings in inspector
  const textInputs = [propTextTemplate, propFontSize, propFontColor, propFontFamily];
  textInputs.forEach(input => {
    input.addEventListener("focus", () => domOverlay.setFocusedElement("text"));
  });

  // Focus extra text overlay on list item click
  listExtraOverlays.addEventListener("focus", () => {
    const idx = parseInt(listExtraOverlays.value);
    if (!isNaN(idx)) domOverlay.setFocusedElement(`extra-${idx}`);
  });

  // Focus media overlay on list item click
  listMediaOverlays.addEventListener("focus", () => {
    const idx = parseInt(listMediaOverlays.value);
    if (!isNaN(idx)) domOverlay.setFocusedElement(`media-${idx}`);
  });
}

async function triggerImport() {
  try {
    const path = await invoke<string>("select_video_file");
    if (!path || path.trim() === "") return;
    
    showToast("Importing media file...", "success");
    const asset = await TauriService.importFile(path);
    asset.id = "asset_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);
    stateManager.assets.push(asset);

    // Sync imported_assets/imported_videos in project
    const newAssets = stateManager.assets.map(a => ({ id: a.id, path: a.path }));
    stateManager.project.imported_assets = newAssets;
    stateManager.project.imported_videos = stateManager.assets.map(a => a.path);
    stateManager.updateProjectField("imported_assets", newAssets);

    // Append to asset list panel
    appendAssetCard(asset);

    // Select asset immediately
    selectAsset(asset);
  } catch (e) {
    showToast(`Import failed: ${e}`, "error");
  }
}

function appendAssetCard(asset: ImportedAsset) {
  const card = document.createElement("div");
  card.className = "asset-card";
  card.dataset.hash = asset.hash;
  card.dataset.id = asset.id;

  const settings = stateManager.project.asset_settings?.[asset.id];
  const trim = settings?.trim;
  const isTrimmed = trim && trim.enabled;
  if (isTrimmed) {
    card.classList.add("trimmed");
  }

  const thumb = document.createElement("img");
  thumb.className = "asset-thumbnail";
  thumb.src = asset.thumbnail_path ? convertFileSrc(asset.thumbnail_path) : "";

  const info = document.createElement("div");
  info.className = "asset-info";

  const name = document.createElement("div");
  name.className = "asset-name";
  name.innerText = asset.name;

  const meta = document.createElement("div");
  meta.className = "asset-meta";
  if (isTrimmed && trim) {
    const activeDur = trim.end - trim.start;
    const origDur = asset.metadata ? asset.metadata.duration : 0;
    meta.innerText = `Active: ${formatDuration(activeDur)} | Orig: ${formatDuration(origDur)}`;
  } else {
    const durationStr = asset.metadata ? formatDuration(asset.metadata.duration) : "00:00";
    const sizeStr = (asset.size_bytes / (1024 * 1024)).toFixed(1) + " MB";
    meta.innerText = `${durationStr} | ${sizeStr}`;
  }

  info.appendChild(name);
  info.appendChild(meta);
  card.appendChild(thumb);
  card.appendChild(info);

  // Asset Action Buttons: Trim Button
  const btnTrim = document.createElement("button");
  btnTrim.className = "asset-trim-btn";
  btnTrim.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="pointer-events: none;"><scissors style="display:none;"></scissors><circle cx="6" cy="6" r="3"></circle><circle cx="6" cy="18" r="3"></circle><line x1="9.8" y1="8.5" x2="20" y2="4"></line><line x1="9.8" y1="15.5" x2="20" y2="20"></line><line x1="8.12" y1="12" x2="12" y2="12"></line></svg>`;
  btnTrim.title = "Trim raw video";
  btnTrim.addEventListener("click", (e) => {
    e.stopPropagation();
    openTrimModal(asset);
  });
  card.appendChild(btnTrim);

  // Asset Action Buttons: Remove Button
  const btnRemove = document.createElement("button");
  btnRemove.className = "asset-remove-btn";
  btnRemove.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="pointer-events: none;"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>`;
  btnRemove.title = "Remove asset";
  btnRemove.addEventListener("click", async (e) => {
    e.stopPropagation();
    
    const confirmed = await showModal({
      title: "Remove Asset",
      message: `Are you sure you want to remove '${asset.name}' from this project?`,
      icon: "🗑️",
      confirmText: "Remove",
      cancelText: "Keep",
      danger: true,
    });
    if (!confirmed) return;
    
    // Remove from state manager cache and project model
    stateManager.assets = stateManager.assets.filter(a => a.hash !== asset.hash);
    stateManager.project.imported_videos = stateManager.project.imported_videos.filter(path => path !== asset.path);
    stateManager.project.imported_assets = stateManager.project.imported_assets.filter(a => a.id !== asset.id);
    if (stateManager.project.asset_settings?.[asset.id]) {
      delete stateManager.project.asset_settings[asset.id];
    }
    stateManager.updateProjectField("imported_assets", stateManager.project.imported_assets);
    
    // Unload viewport if current selection gets removed
    if (currentSelectedAsset?.hash === asset.hash) {
      currentSelectedAsset = null;
      canvasRenderer.clearVideo();
      clipsGridContainer.innerHTML = "";
      toggleDashboard(true);
    }
    
    // Animate removal from domestic panel
    card.remove();
    showToast(`Removed '${asset.name}'`, "warning");
  });
  card.appendChild(btnRemove);

  card.addEventListener("click", () => selectAsset(asset));
  assetListContainer.appendChild(card);
}

function selectAsset(asset: ImportedAsset) {
  currentSelectedAsset = asset;
  
  // Highlight active card
  document.querySelectorAll(".asset-card").forEach((c) => {
    const div = c as HTMLDivElement;
    if (div.dataset.hash === asset.hash) {
      div.style.borderColor = "var(--accent)";
      div.style.background = "rgba(255, 255, 255, 0.06)";
    } else {
      div.style.borderColor = "var(--panel-border)";
      div.style.background = "rgba(255, 255, 255, 0.02)";
    }
  });

  // Update config paths
  stateManager.project.input_paths = [asset.path];
  stateManager.project.input_path = asset.path;

  // Re-resolve source dimensions if resolution is set to Source
  if (stateManager.project.output_resolution === "Source" && asset.metadata) {
    stateManager.project.output_width = asset.metadata.width;
    stateManager.project.output_height = asset.metadata.height;
  }

  // Adjust video placement box to match the loaded video's actual aspect ratio to prevent pixel stretching
  if (asset.metadata && asset.metadata.width && asset.metadata.height) {
    const assetRatio = asset.metadata.width / asset.metadata.height;
    const canvasW = stateManager.project.output_width || 1080;
    const canvasH = stateManager.project.output_height || 1920;
    
    // Fit video width to canvas width and calculate height proportionally
    const newW = canvasW;
    const newH = Math.round(canvasW / assetRatio);
    const newX = 0;
    const newY = Math.round((canvasH - newH) / 2);

    stateManager.project.video_placement = {
      enabled: true,
      x: newX,
      y: newY,
      width: newW,
      height: newH,
    };
  }

  stateManager.updateProjectDirectly(stateManager.project);

  // Load selected video immediately to the preview engine
  try {
    const webSrc = convertFileSrc(asset.path);
    canvasRenderer.setVideoSource(webSrc);
    
    const settings = stateManager.project.asset_settings?.[asset.id];
    const trim = settings?.trim;
    if (trim && trim.enabled) {
      canvasRenderer.setCurrentTime(trim.start);
    }
    
    canvasRenderer.play();
  } catch (e) {
    console.error("Direct video source loading failed:", e);
  }
  
  toggleDashboard(false);
  rebuildClipTimeline();
}

function rebuildClipTimeline() {
  clipsGridContainer.innerHTML = "";
  if (!currentSelectedAsset || !currentSelectedAsset.metadata) return;

  const duration = currentSelectedAsset.metadata.duration;
  const settings = stateManager.project.asset_settings?.[currentSelectedAsset.id];
  const trim = settings?.trim;
  const isTrimmed = trim && trim.enabled;
  const trimStart = isTrimmed ? trim.start : 0;
  const trimEnd = isTrimmed ? trim.end : duration;
  const activeDuration = Math.max(0.01, trimEnd - trimStart);
  
  const clipLength = stateManager.project.clip_duration || 50;
  const totalClips = Math.ceil(activeDuration / clipLength);

  const exportFrom = document.getElementById("prop-export-from") as HTMLInputElement;
  const exportTo = document.getElementById("prop-export-to") as HTMLInputElement;
  if (exportFrom && exportTo) {
    exportFrom.value = "1";
    exportFrom.max = totalClips.toString();
    exportTo.max = totalClips.toString();
    exportTo.placeholder = `${totalClips} (last)`;
  }

  txtQueueStatus.innerText = `Found ${totalClips} clip(s) available for batch split.`;

  for (let i = 1; i <= totalClips; i++) {
    const card = document.createElement("div");
    card.className = "asset-card timeline-clip-card";
    card.style.flexDirection = "column";
    card.style.width = "130px";
    card.style.padding = "6px";
    card.style.textAlign = "center";
    card.dataset.index = i.toString();

    const label = document.createElement("div");
    label.className = "asset-name";
    label.innerText = `Part ${i.toString().padStart(3, "0")}`;

    const meta = document.createElement("div");
    meta.className = "asset-meta";
    const startOffset = trimStart + (i - 1) * clipLength;
    const endOffset = Math.min(startOffset + clipLength, trimEnd);
    meta.innerText = `${formatDuration(startOffset)} - ${formatDuration(endOffset)}`;

    card.appendChild(label);
    card.appendChild(meta);

    card.addEventListener("click", () => {
      stateManager.project.selected_clip_index = i;
      stateManager.project.start_clip = i;
      
      // Seek video playback to the selected clip part's starting offset
      const seekTime = trimStart + (i - 1) * clipLength;
      canvasRenderer.setCurrentTime(seekTime);

      // Highlight timeline clip card
      document.querySelectorAll(".timeline-clip-card").forEach((tc) => {
        const div = tc as HTMLDivElement;
        if (div.dataset.index === i.toString()) {
          div.style.borderColor = "var(--accent)";
          div.style.background = "rgba(255, 255, 255, 0.06)";
        } else {
          div.style.borderColor = "var(--panel-border)";
          div.style.background = "rgba(255, 255, 255, 0.02)";
        }
      });

      // Update text overlays to reflect the new part number immediately
      const finalW = parseFloat(canvasViewport.style.width);
      const finalH = parseFloat(canvasViewport.style.height);
      domOverlay.update(stateManager.project, finalW, finalH);

      showToast(`Selected Part ${i}`, "success");
    });

    clipsGridContainer.appendChild(card);
  }
}

async function generatePreview() {
  if (!currentSelectedAsset) {
    showToast("Import a video asset first", "warning");
    return;
  }
  showToast("Generating first-frame draft clip...", "success");
  
  try {
    // Sync AppStateManager project config schema fields
    const config: AppConfig = {
      ...stateManager.project,
      input_path: currentSelectedAsset.path,
      input_paths: [currentSelectedAsset.path],
    };

    const path = await TauriService.generatePreviewClip(config);
    
    // Convert resolved path to web-safe Tauri asset URL
    const webSrc = convertFileSrc(path);
    canvasRenderer.setVideoSource(webSrc);
    canvasRenderer.play();
    
    showToast("Preview loaded successfully!", "success");
  } catch (e) {
    showToast(`Preview failed: ${e}`, "error");
  }
}

async function startBatchExport() {
  if (!currentSelectedAsset || !currentSelectedAsset.metadata) {
    showToast("Select a video asset first", "warning");
    return;
  }

  try {
    const outPath = await invoke<string>("select_output_folder");
    if (!outPath || outPath.trim() === "") return;

    stateManager.project.output_path = outPath;

    const duration = currentSelectedAsset.metadata.duration;
    const clipLength = stateManager.project.clip_duration || 50;
    const totalClips = Math.ceil(duration / clipLength);

    const exportFrom = document.getElementById("prop-export-from") as HTMLInputElement;
    const exportTo = document.getElementById("prop-export-to") as HTMLInputElement;

    let startVal = 1;
    let endVal = totalClips;
    if (exportFrom && exportTo) {
      startVal = Math.max(1, Math.min(totalClips, parseInt(exportFrom.value) || 1));
      endVal = Math.max(startVal, Math.min(totalClips, parseInt(exportTo.value) || totalClips));
    }

    const exportCount = (endVal - startVal) + 1;
    showToast(`Exporting ${exportCount} clips in queue (${startVal} to ${endVal})...`, "success");
    
    // Route config
    const config: AppConfig = {
      ...stateManager.project,
      input_path: currentSelectedAsset.path,
      input_paths: [currentSelectedAsset.path],
      output_path: outPath,
    };

    // Trigger render commands queue in tokio threadpool
    const jobIds = await TauriService.startRenderQueue(config, startVal, endVal);
    
    // Populate RenderQueue tab views
    switchBottomTab("render");
    
    // Populate active job cards
    jobIds.forEach(async (id) => {
      const job = await TauriService.getJobsList().then(list => list.find(j => j.id === id));
      if (job) {
        appendJobUi(job);
      }
    });

  } catch (e) {
    showToast(`Export queue failed: ${e}`, "error");
  }
}

function appendJobUi(job: RenderJob) {
  const row = document.createElement("div");
  row.className = "queue-row";
  row.dataset.id = job.id;

  const colInfo = document.createElement("div");
  colInfo.className = "queue-col grow";
  
  const title = document.createElement("div");
  title.className = "queue-title";
  title.innerText = job.name;

  const bar = document.createElement("div");
  bar.className = "queue-progress-bar";

  const fill = document.createElement("div");
  fill.className = "queue-progress-fill";
  fill.style.width = "0%";

  bar.appendChild(fill);
  colInfo.appendChild(title);
  colInfo.appendChild(bar);

  const colStats = document.createElement("div");
  colStats.className = "queue-col";
  colStats.style.width = "180px";

  const speed = document.createElement("div");
  speed.className = "queue-meta";
  speed.innerText = "Speed: -- | ETA: --";

  const status = document.createElement("div");
  status.style.marginTop = "6px";
  const badge = document.createElement("span");
  badge.className = "status-badge queued";
  badge.innerText = "Queued";
  status.appendChild(badge);

  colStats.appendChild(speed);
  colStats.appendChild(status);

  const colActions = document.createElement("div");
  colActions.className = "queue-col";
  
  const cancelBtn = document.createElement("button");
  cancelBtn.className = "toolbar-btn";
  cancelBtn.style.padding = "4px 8px";
  cancelBtn.style.background = "var(--danger)";
  cancelBtn.style.color = "white";
  cancelBtn.innerText = "Cancel";
  cancelBtn.addEventListener("click", () => {
    TauriService.cancelRenderJob(job.id);
  });

  colActions.appendChild(cancelBtn);

  row.appendChild(colInfo);
  row.appendChild(colStats);
  row.appendChild(colActions);

  jobsListContainer.appendChild(row);
  activeJobUis.set(job.id, row);
}

function setupTauriEventListeners() {
  TauriService.onJobStarted((id) => {
    const row = activeJobUis.get(id);
    if (row) {
      const badge = row.querySelector(".status-badge") as HTMLSpanElement;
      badge.className = "status-badge encoding";
      badge.innerText = "Encoding";
    }
  });

  TauriService.onJobProgress((id, progress, speed, _elapsed, eta) => {
    const row = activeJobUis.get(id);
    if (row) {
      const fill = row.querySelector(".queue-progress-fill") as HTMLDivElement;
      fill.style.width = `${progress}%`;

      const stats = row.querySelector(".queue-meta") as HTMLDivElement;
      const etaStr = eta !== null ? formatDuration(eta) : "--:--";
      stats.innerText = `Speed: ${speed} | ETA: ${etaStr}`;
    }
  });

  TauriService.onJobCompleted((id) => {
    const row = activeJobUis.get(id);
    if (row) {
      const fill = row.querySelector(".queue-progress-fill") as HTMLDivElement;
      fill.style.width = "100%";

      const badge = row.querySelector(".status-badge") as HTMLSpanElement;
      badge.className = "status-badge completed";
      badge.innerText = "Completed";

      const stats = row.querySelector(".queue-meta") as HTMLDivElement;
      stats.innerText = "Finished successfully";

      const cancelBtn = row.querySelector("button") as HTMLButtonElement;
      cancelBtn.disabled = true;
      cancelBtn.innerText = "Done";
      
      showToast("Clip render complete!", "success");
    }
  });

  TauriService.onFFmpegLog((_id, _line) => {
    // console.log(`[FFmpeg Log ${id}]: ${line}`);
  });
}

async function cancelAllRenders() {
  await TauriService.cancelAllJobs();
  showToast("All active render queue jobs cancelled.", "warning");
}

async function clearCacheDir() {
  await TauriService.clearCache();
  showToast("Central cache directory cleared.", "success");
}

function switchBottomTab(tab: "clips" | "render") {
  if (tab === "clips") {
    tabClipQueue.className = "tab-btn active";
    tabRenderQueue.className = "tab-btn";
    paneClipQueue.style.display = "block";
    paneRenderQueue.style.display = "none";
  } else {
    tabClipQueue.className = "tab-btn";
    tabRenderQueue.className = "tab-btn active";
    paneClipQueue.style.display = "none";
    paneRenderQueue.style.display = "block";
  }
}


function setupCommandPalette() {
  paletteSearch.addEventListener("input", () => {
    const q = paletteSearch.value.toLowerCase();
    paletteResults.innerHTML = "";

    const commands = [
      { name: "Command: Import Video File", action: triggerImport },
      { name: "Command: Clear Cache Directory", action: clearCacheDir },
      { name: "Command: Preview Draft Clip", action: generatePreview },
      { name: "Command: Batch Export Queue", action: startBatchExport },
      { name: "Command: Switch to Clips Timeline", action: () => switchBottomTab("clips") },
      { name: "Command: Switch to Render Queue", action: () => switchBottomTab("render") },
      { name: "Command: Save Project", action: () => showToast("Project saved successfully!", "success") },
      { name: "Command: Open User Manual", action: () => {
          const userManualModal = document.getElementById("user-manual-modal");
          if (userManualModal) userManualModal.style.display = "flex";
      }},
      { name: "Theme: Apply Dark Obsidian", action: () => {
          selectTheme.value = "dark-obsidian";
          selectTheme.dispatchEvent(new Event("change"));
      }},
      { name: "Theme: Apply Cyberpunk Neon", action: () => {
          selectTheme.value = "cyberpunk-neon";
          selectTheme.dispatchEvent(new Event("change"));
      }},
      { name: "Theme: Apply Forest Slate", action: () => {
          selectTheme.value = "forest-slate";
          selectTheme.dispatchEvent(new Event("change"));
      }},
      { name: "Theme: Apply Royal Amethyst", action: () => {
          selectTheme.value = "royal-amethyst";
          selectTheme.dispatchEvent(new Event("change"));
      }},
      { name: "Theme: Apply Light Glassmorphism", action: () => {
          selectTheme.value = "light-glassmorphism";
          selectTheme.dispatchEvent(new Event("change"));
      }},
      { name: "Command: Show Keyboard Shortcuts Help", action: () => showToast("Hotkeys: Ctrl+Z (Undo), Ctrl+Y (Redo), Ctrl+K (Palette), Esc (Close)", "warning") },
      { name: "Layout: Fit Original Aspect Ratio", action: () => {
          propAspectRatio.value = "original";
          propAspectRatio.dispatchEvent(new Event("change"));
          showToast("Layout set to original aspect ratio", "success");
      }},
      { name: "Layout: Fit Vertical Crop (9:16 Shorts)", action: () => {
          propAspectRatio.value = "9:16";
          propAspectRatio.dispatchEvent(new Event("change"));
          showToast("Layout set to 9:16 Vertical Shorts", "success");
      }}
    ];

    // Dynamically insert loaded fonts into search space
    stateManager.fonts.forEach((font) => {
      commands.push({
        name: `Font: Apply Font Family - ${font.name}`,
        action: () => {
          propFontFamily.value = font.name;
          propFontFamily.dispatchEvent(new Event("change"));
          showToast(`Font set to ${font.name}`, "success");
        }
      });
    });

    // Dynamically insert active project assets
    stateManager.assets.forEach((asset) => {
      commands.push({
        name: `Asset: Select Imported Media - ${asset.name}`,
        action: () => {
          selectAsset(asset);
          showToast(`Selected asset: ${asset.name}`, "success");
        }
      });
    });

    commands
      .filter((c) => c.name.toLowerCase().includes(q))
      .slice(0, 15)
      .forEach((c) => {
        const item = document.createElement("div");
        item.className = "palette-item";
        item.innerText = c.name;
        item.addEventListener("click", () => {
          c.action();
          commandPalette.style.display = "none";
        });
        paletteResults.appendChild(item);
      });
  });
}

function toggleCommandPalette() {
  if (commandPalette.style.display === "none") {
    commandPalette.style.display = "flex";
    paletteSearch.value = "";
    paletteSearch.focus();
    // Trigger initial filter
    paletteSearch.dispatchEvent(new Event("input"));
  } else {
    commandPalette.style.display = "none";
  }
}

// Helpers
function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function showToast(message: string, type: "success" | "warning" | "error" = "success") {
  const tray = document.querySelector("#notification-tray")!;
  
  // Enforce a maximum of 4 messages by removing the oldest toast first
  while (tray.children.length >= 4) {
    tray.firstElementChild?.remove();
  }

  const toast = document.createElement("div");
  toast.className = `notification-toast ${type}`;
  toast.innerText = message;
  tray.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 4000);
}

function showModal(options: {
  title: string;
  message: string;
  icon?: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}): Promise<boolean> {
  return new Promise((resolve) => {
    const overlay = document.getElementById("custom-modal")!;
    const title = document.getElementById("modal-title")!;
    const message = document.getElementById("modal-message")!;
    const icon = document.getElementById("modal-icon")!;
    const btnConfirm = document.getElementById("modal-confirm")! as HTMLButtonElement;
    const btnCancel = document.getElementById("modal-cancel")! as HTMLButtonElement;

    title.innerText = options.title;
    message.innerText = options.message;
    icon.innerText = options.icon || "⚠️";
    btnConfirm.innerText = options.confirmText || "Confirm";
    btnCancel.innerText = options.cancelText || "Cancel";

    if (options.danger) {
      btnConfirm.classList.add("danger");
    } else {
      btnConfirm.classList.remove("danger");
    }

    overlay.style.display = "flex";

    function cleanup() {
      overlay.style.display = "none";
      btnConfirm.removeEventListener("click", onConfirm);
      btnCancel.removeEventListener("click", onCancel);
      overlay.removeEventListener("click", onBackdrop);
    }

    function onConfirm() {
      cleanup();
      resolve(true);
    }

    function onCancel() {
      cleanup();
      resolve(false);
    }

    function onBackdrop(e: Event) {
      if (e.target === overlay) {
        cleanup();
        resolve(false);
      }
    }

    btnConfirm.addEventListener("click", onConfirm);
    btnCancel.addEventListener("click", onCancel);
    overlay.addEventListener("click", onBackdrop);

    // Focus the confirm button
    btnConfirm.focus();
  });
}

function setupWorkspaceResizers() {
  const leftPanel = document.getElementById("left-panel") as HTMLDivElement;
  const rightPanel = document.getElementById("right-panel") as HTMLDivElement;
  const bottomPanel = document.getElementById("bottom-panel") as HTMLDivElement;
  const leftResizer = document.getElementById("left-resizer") as HTMLDivElement;
  const rightResizer = document.getElementById("right-resizer") as HTMLDivElement;
  const bottomResizer = document.getElementById("bottom-resizer") as HTMLDivElement;

  if (!leftPanel || !rightPanel || !bottomPanel || !leftResizer || !rightResizer || !bottomResizer) {
    return;
  }

  // Left Panel Resize
  leftResizer.addEventListener("mousedown", (e) => {
    e.preventDefault();
    leftResizer.classList.add("dragging");
    const startX = e.clientX;
    const startWidth = leftPanel.clientWidth;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const newWidth = Math.max(200, Math.min(500, startWidth + (moveEvent.clientX - startX)));
      leftPanel.style.width = `${newWidth}px`;
      refreshViewport();
    };

    const onMouseUp = () => {
      leftResizer.classList.remove("dragging");
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  });

  // Right Panel Resize
  rightResizer.addEventListener("mousedown", (e) => {
    e.preventDefault();
    rightResizer.classList.add("dragging");
    const startX = e.clientX;
    const startWidth = rightPanel.clientWidth;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const newWidth = Math.max(240, Math.min(600, startWidth - (moveEvent.clientX - startX)));
      rightPanel.style.width = `${newWidth}px`;
      refreshViewport();
    };

    const onMouseUp = () => {
      rightResizer.classList.remove("dragging");
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  });

  // Bottom Panel Resize
  bottomResizer.addEventListener("mousedown", (e) => {
    e.preventDefault();
    bottomResizer.classList.add("dragging");
    const startY = e.clientY;
    const startHeight = bottomPanel.clientHeight;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const newHeight = Math.max(150, Math.min(500, startHeight - (moveEvent.clientY - startY)));
      bottomPanel.style.height = `${newHeight}px`;
      refreshViewport();
    };

    const onMouseUp = () => {
      bottomResizer.classList.remove("dragging");
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  });
}

function setupPlaybackControls() {
  const video = canvasRenderer.getVideoElement();
  const btnPlayPause = document.getElementById("btn-play-pause")!;
  const txtTime = document.getElementById("txt-playback-time")!;

  if (!video || !btnPlayPause || !txtTime) {
    return;
  }

  const playIcon = `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
  const pauseIcon = `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;

  video.addEventListener("play", () => {
    btnPlayPause.innerHTML = pauseIcon;
  });
  video.addEventListener("pause", () => {
    btnPlayPause.innerHTML = playIcon;
  });

  const formatTime = (secs: number) => {
    if (isNaN(secs) || !isFinite(secs)) return "00:00";
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  video.addEventListener("timeupdate", () => {
    const cur = formatTime(video.currentTime || 0);
    const dur = formatTime(video.duration || 0);
    txtTime.innerText = `${cur} / ${dur}`;

    // Loop playback within custom trim boundaries or selected clip part boundaries
    if (currentSelectedAsset) {
      const settings = stateManager.project.asset_settings?.[currentSelectedAsset.id];
      const trim = settings?.trim;
      const isTrimmed = trim && trim.enabled;
      const trimStart = isTrimmed ? trim.start : 0;
      const trimEnd = isTrimmed ? trim.end : (video.duration || 0);

      if (stateManager.project.selected_clip_index !== null && stateManager.project.selected_clip_index !== undefined) {
        const idx = stateManager.project.selected_clip_index;
        const clipLength = stateManager.project.clip_duration || 50;
        const startOffset = trimStart + (idx - 1) * clipLength;
        const endOffset = Math.min(startOffset + clipLength, trimEnd);

        if (video.currentTime < startOffset - 0.5 || video.currentTime >= endOffset) {
          video.currentTime = startOffset;
        }
      } else if (isTrimmed) {
        if (video.currentTime < trimStart - 0.5 || video.currentTime >= trimEnd) {
          video.currentTime = trimStart;
        }
      }
    }
  });

  video.addEventListener("loadedmetadata", () => {
    const cur = formatTime(video.currentTime || 0);
    const dur = formatTime(video.duration || 0);
    txtTime.innerText = `${cur} / ${dur}`;
  });

  btnPlayPause.addEventListener("click", () => {
    if (!video.src || video.src.trim() === "") {
      showToast("No media loaded to play.", "warning");
      return;
    }
    if (video.paused) {
      video.play().catch(e => console.error("Playback error:", e));
    } else {
      video.pause();
    }
  });
}

function toggleDashboard(show: boolean) {
  const dashboard = document.getElementById("startup-dashboard");
  if (dashboard) {
    dashboard.style.display = show ? "flex" : "none";
  }
}

function setupDashboard() {
  const dashboard = document.getElementById("startup-dashboard");
  if (!dashboard) return;

  // Tab Switching
  const menuItems = document.querySelectorAll(".dash-menu-item");
  menuItems.forEach((btn) => {
    btn.addEventListener("click", () => {
      menuItems.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      
      const targetTab = (btn as HTMLButtonElement).dataset.tab;
      document.querySelectorAll(".dash-tab-content").forEach((pane) => {
        pane.classList.remove("active");
      });
      if (targetTab) {
        document.getElementById(targetTab)?.classList.add("active");
      }
    });
  });

  document.getElementById("dash-btn-back-home")?.addEventListener("click", () => {
    const homeBtn = document.querySelector('[data-tab="dash-tab-home"]') as HTMLButtonElement;
    homeBtn?.click();
  });

  // Action Bindings
  document.getElementById("dash-btn-new")?.addEventListener("click", () => {
    stateManager.project = stateManager.createDefaultProject();
    stateManager.history.clear();
    currentSelectedAsset = null;
    assetListContainer.innerHTML = "";
    clipsGridContainer.innerHTML = "";
    canvasRenderer.clearVideo();
    stateManager.updateProjectDirectly(stateManager.project);
    syncConfigToUi();
    toggleDashboard(false);
    showToast("New project session started.", "success");
  });

  document.getElementById("dash-btn-open")?.addEventListener("click", () => {
    document.getElementById("btn-open-project")?.click();
  });

  document.getElementById("dash-btn-import")?.addEventListener("click", () => {
    triggerImport();
  });

  // Template Quick aspect ratios
  document.querySelectorAll(".dash-template-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const element = btn as HTMLButtonElement;
      const ratio = element.dataset.ratio || "original";
      const res = element.dataset.res || "Source";
      
      stateManager.project = stateManager.createDefaultProject();
      stateManager.project.aspect_ratio = ratio;
      stateManager.project.output_resolution = res;
      
      if (res.startsWith("1080x1920")) {
        stateManager.project.output_width = 1080;
        stateManager.project.output_height = 1920;
      } else if (res.startsWith("1920x1080")) {
        stateManager.project.output_width = 1920;
        stateManager.project.output_height = 1080;
      }
      
      stateManager.history.clear();
      currentSelectedAsset = null;
      assetListContainer.innerHTML = "";
      clipsGridContainer.innerHTML = "";
      canvasRenderer.clearVideo();
      stateManager.updateProjectDirectly(stateManager.project);
      syncConfigToUi();
      toggleDashboard(false);
      showToast(`Started new project template (${ratio})`, "success");
    });
  });
}

function syncColorPreviewButtons() {
  document.querySelectorAll(".color-picker-wrapper").forEach((wrapper) => {
    const trigger = wrapper.querySelector(".color-preview-btn") as HTMLButtonElement;
    const hiddenInput = wrapper.querySelector("input[type='color']") as HTMLInputElement;
    if (trigger && hiddenInput) {
      trigger.style.backgroundColor = hiddenInput.value;
    }
  });
}

class CustomColorPicker {
  private popover: HTMLDivElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private cursor: HTMLDivElement;
  private previewCircle: HTMLDivElement;
  private hueSlider: HTMLInputElement;
  private hexText: HTMLInputElement;
  private btnOk: HTMLButtonElement;

  private currentInput: HTMLInputElement | null = null;
  private currentTrigger: HTMLButtonElement | null = null;

  private hue = 0;
  private sat = 0;
  private val = 0;
  private isDragging = false;

  constructor() {
    this.popover = document.getElementById("custom-color-picker-popover") as HTMLDivElement;
    this.canvas = document.getElementById("cp-canvas") as HTMLCanvasElement;
    this.ctx = this.canvas.getContext("2d")!;
    this.cursor = document.getElementById("cp-cursor") as HTMLDivElement;
    this.previewCircle = document.getElementById("cp-preview-circle") as HTMLDivElement;
    this.hueSlider = document.getElementById("cp-hue-slider") as HTMLInputElement;
    this.hexText = document.getElementById("cp-hex-text") as HTMLInputElement;
    this.btnOk = document.getElementById("cp-btn-ok") as HTMLButtonElement;

    this.initEvents();
  }

  private initEvents() {
    this.hueSlider.addEventListener("input", () => {
      this.hue = parseInt(this.hueSlider.value);
      this.drawSpectrum();
      this.updateColorFromPosition();
    });

    const handleCanvasSelect = (e: MouseEvent) => {
      const rect = this.canvas.getBoundingClientRect();
      let x = e.clientX - rect.left;
      let y = e.clientY - rect.top;
      x = Math.max(0, Math.min(x, this.canvas.width));
      y = Math.max(0, Math.min(y, this.canvas.height));

      this.cursor.style.left = `${x}px`;
      this.cursor.style.top = `${y}px`;

      this.updateColorFromPosition(x, y);
    };

    this.canvas.addEventListener("mousedown", (e) => {
      this.isDragging = true;
      handleCanvasSelect(e);
    });

    document.addEventListener("mousemove", (e) => {
      if (this.isDragging) {
        handleCanvasSelect(e);
      }
    });

    document.addEventListener("mouseup", () => {
      this.isDragging = false;
    });

    this.hexText.addEventListener("input", () => {
      let val = this.hexText.value;
      if (val.startsWith("#") && (val.length === 4 || val.length === 7)) {
        this.setColor(val);
      }
    });

    this.btnOk.addEventListener("click", () => {
      if (this.currentInput && this.currentTrigger) {
        const finalColor = this.hexText.value;
        this.currentInput.value = finalColor;
        this.currentTrigger.style.backgroundColor = finalColor;
        this.currentInput.dispatchEvent(new Event("change"));
      }
      this.close();
    });

    document.addEventListener("mousedown", (e) => {
      const target = e.target as HTMLElement;
      if (!this.popover.contains(target) && (!this.currentTrigger || !this.currentTrigger.contains(target))) {
        this.close();
      }
    });
  }

  public open(trigger: HTMLButtonElement, input: HTMLInputElement) {
    this.currentTrigger = trigger;
    this.currentInput = input;

    const rect = trigger.getBoundingClientRect();
    this.popover.style.position = "fixed";

    // Position below the trigger, clamped to viewport
    let top = rect.bottom + 6;
    let left = rect.left;

    // Clamp to viewport bottom
    const popoverHeight = 260; // approximate
    if (top + popoverHeight > window.innerHeight) {
      top = rect.top - popoverHeight - 6; // flip above
    }
    // Clamp to viewport right
    const popoverWidth = 244;
    if (left + popoverWidth > window.innerWidth) {
      left = window.innerWidth - popoverWidth - 8;
    }

    this.popover.style.left = `${left}px`;
    this.popover.style.top = `${top}px`;
    this.popover.style.display = "flex";

    this.setColor(input.value);
  }

  public close() {
    this.popover.style.display = "none";
    this.currentTrigger = null;
    this.currentInput = null;
  }

  private setColor(hex: string) {
    const rgb = this.hexToRgb(hex);
    if (!rgb) return;
    const hsv = this.rgbToHsv(rgb.r, rgb.g, rgb.b);

    this.hue = Math.round(hsv.h);
    this.sat = hsv.s;
    this.val = hsv.v;

    this.hueSlider.value = this.hue.toString();
    this.drawSpectrum();

    const x = this.sat * this.canvas.width;
    const y = (1 - this.val) * this.canvas.height;
    this.cursor.style.left = `${x}px`;
    this.cursor.style.top = `${y}px`;

    this.updateColorPreview(hex);
  }

  private drawSpectrum() {
    const width = this.canvas.width;
    const height = this.canvas.height;

    const gradWhite = this.ctx.createLinearGradient(0, 0, width, 0);
    gradWhite.addColorStop(0, "rgba(255, 255, 255, 1)");
    gradWhite.addColorStop(1, `hsla(${this.hue}, 100%, 50%, 1)`);
    this.ctx.fillStyle = gradWhite;
    this.ctx.fillRect(0, 0, width, height);

    const gradBlack = this.ctx.createLinearGradient(0, 0, 0, height);
    gradBlack.addColorStop(0, "rgba(0, 0, 0, 0)");
    gradBlack.addColorStop(1, "rgba(0, 0, 0, 1)");
    this.ctx.fillStyle = gradBlack;
    this.ctx.fillRect(0, 0, width, height);
  }

  private updateColorFromPosition(
    x = parseFloat(this.cursor.style.left),
    y = parseFloat(this.cursor.style.top)
  ) {
    this.sat = x / this.canvas.width;
    this.val = 1 - (y / this.canvas.height);

    const rgb = this.hsvToRgb(this.hue, this.sat, this.val);
    const hex = this.rgbToHex(rgb.r, rgb.g, rgb.b);
    this.updateColorPreview(hex);

    if (this.currentInput && this.currentTrigger) {
      this.currentInput.value = hex;
      this.currentTrigger.style.backgroundColor = hex;
      this.currentInput.dispatchEvent(new Event("input"));
    }
  }

  private updateColorPreview(hex: string) {
    this.previewCircle.style.backgroundColor = hex;
    this.hexText.value = hex.toUpperCase();
  }

  private hexToRgb(hex: string) {
    const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
    hex = hex.replace(shorthandRegex, (_, r, g, b) => r + r + g + g + b + b);
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : null;
  }

  private rgbToHex(r: number, g: number, b: number) {
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  private rgbToHsv(r: number, g: number, b: number) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0;
    const v = max;
    const d = max - min;
    s = max === 0 ? 0 : d / max;
    if (max !== min) {
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h /= 6;
    }
    return { h: h * 360, s, v };
  }

  private hsvToRgb(h: number, s: number, v: number) {
    let r = 0, g = 0, b = 0;
    const i = Math.floor(h / 60) % 6;
    const f = h / 60 - Math.floor(h / 60);
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);
    switch (i) {
      case 0: r = v; g = t; b = p; break;
      case 1: r = q; g = v; b = p; break;
      case 2: r = p; g = v; b = t; break;
      case 3: r = p; g = q; b = v; break;
      case 4: r = t; g = p; b = v; break;
      case 5: r = v; g = p; b = q; break;
    }
    return {
      r: Math.round(r * 255),
      g: Math.round(g * 255),
      b: Math.round(b * 255)
    };
  }
}

// ── Trim Modal Controller ──
function openTrimModal(asset: ImportedAsset) {
  trimModalFilename.textContent = asset.name;
  trimLoadingOverlay.style.display = "flex";
  trimModalVideo.src = convertFileSrc(asset.path);
  trimModalVideo.load();

  // Disable controls until loaded
  trimStartInput.disabled = true;
  trimEndInput.disabled = true;
  btnSetTrimStart.disabled = true;
  btnSetTrimEnd.disabled = true;
  btnTrimReset.disabled = true;
  btnTrimSave.disabled = true;

  let duration = 0;

  const onLoadedMetadata = () => {
    trimLoadingOverlay.style.display = "none";
    duration = trimModalVideo.duration || 0;
    
    // Enable controls
    trimStartInput.disabled = false;
    trimEndInput.disabled = false;
    btnSetTrimStart.disabled = false;
    btnSetTrimEnd.disabled = false;
    btnTrimReset.disabled = false;
    btnTrimSave.disabled = false;

    // Load existing settings or set defaults
    const settings = stateManager.project.asset_settings?.[asset.id];
    const trim = settings?.trim;
    const isTrimmed = trim && trim.enabled;

    trimStartInput.value = isTrimmed ? trim.start.toFixed(2) : "0.00";
    trimEndInput.value = isTrimmed ? trim.end.toFixed(2) : duration.toFixed(2);
    trimEnabledCheckbox.checked = isTrimmed ? trim.enabled : false;

    trimTimeDuration.textContent = formatDuration(duration);
    updateRangeTrack();
  };

  const updateRangeTrack = () => {
    if (duration <= 0) return;
    const start = Math.max(0, Math.min(duration, parseFloat(trimStartInput.value) || 0));
    const end = Math.max(start, Math.min(duration, parseFloat(trimEndInput.value) || duration));
    
    const leftPct = (start / duration) * 100;
    const widthPct = ((end - start) / duration) * 100;
    
    trimTimelineRange.style.left = `${leftPct}%`;
    trimTimelineRange.style.width = `${widthPct}%`;

    // Toggle save button state based on simple range validation
    if (start >= end || start < 0 || end > duration + 0.1) {
      btnTrimSave.disabled = true;
    } else {
      btnTrimSave.disabled = false;
    }
  };

  const onTimeUpdate = () => {
    trimTimeCurrent.textContent = formatDuration(trimModalVideo.currentTime);
  };

  // Bind Listeners
  trimModalVideo.addEventListener("loadedmetadata", onLoadedMetadata);
  trimModalVideo.addEventListener("timeupdate", onTimeUpdate);

  const startInputHandler = () => {
    // Prevent typing negative start or exceeding end
    let val = parseFloat(trimStartInput.value) || 0;
    if (val < 0) val = 0;
    trimStartInput.value = val.toFixed(2);
    updateRangeTrack();
  };

  const endInputHandler = () => {
    let val = parseFloat(trimEndInput.value) || duration;
    if (val > duration) val = duration;
    trimEndInput.value = val.toFixed(2);
    updateRangeTrack();
  };

  trimStartInput.addEventListener("change", startInputHandler);
  trimEndInput.addEventListener("change", endInputHandler);

  const onSetStartClick = () => {
    const cur = parseFloat(trimModalVideo.currentTime.toFixed(2));
    trimStartInput.value = cur.toString();
    updateRangeTrack();
  };

  const onSetEndClick = () => {
    const cur = parseFloat(trimModalVideo.currentTime.toFixed(2));
    trimEndInput.value = cur.toString();
    updateRangeTrack();
  };

  btnSetTrimStart.addEventListener("click", onSetStartClick);
  btnSetTrimEnd.addEventListener("click", onSetEndClick);

  const onResetClick = () => {
    trimStartInput.value = "0.00";
    trimEndInput.value = duration.toFixed(2);
    trimEnabledCheckbox.checked = false;
    updateRangeTrack();
  };

  btnTrimReset.addEventListener("click", onResetClick);

  const closeTrimModal = () => {
    trimModal.style.display = "none";
    trimModalVideo.pause();
    trimModalVideo.src = "";

    // Cleanup listeners
    trimModalVideo.removeEventListener("loadedmetadata", onLoadedMetadata);
    trimModalVideo.removeEventListener("timeupdate", onTimeUpdate);
    trimStartInput.removeEventListener("change", startInputHandler);
    trimEndInput.removeEventListener("change", endInputHandler);
    btnSetTrimStart.removeEventListener("click", onSetStartClick);
    btnSetTrimEnd.removeEventListener("click", onSetEndClick);
    btnTrimReset.removeEventListener("click", onResetClick);
    btnTrimCancel.removeEventListener("click", onCancelClick);
    btnTrimSave.removeEventListener("click", onSaveClick);
  };

  const onCancelClick = () => {
    closeTrimModal();
  };

  btnTrimCancel.addEventListener("click", onCancelClick);

  const onSaveClick = () => {
    const isEnabled = trimEnabledCheckbox.checked;
    const start = Math.max(0, Math.min(duration, parseFloat(trimStartInput.value) || 0));
    const end = Math.max(start, Math.min(duration, parseFloat(trimEndInput.value) || duration));

    const currentSettings = { ...stateManager.project.asset_settings };
    
    // Only save settings if trimming is enabled and differs from default bounds
    const isModified = start > 0.01 || end < duration - 0.01;
    if (isEnabled && isModified) {
      currentSettings[asset.id] = {
        ...currentSettings[asset.id],
        trim: { start, end, enabled: true }
      };
    } else {
      if (currentSettings[asset.id]) {
        delete currentSettings[asset.id].trim;
        if (Object.keys(currentSettings[asset.id]).length === 0) {
          delete currentSettings[asset.id];
        }
      }
    }

    stateManager.updateProjectField("asset_settings", currentSettings);
    
    // Refresh asset card UI
    assetListContainer.innerHTML = "";
    stateManager.assets.forEach(a => appendAssetCard(a));

    // Refresh timeline clips bounds
    if (currentSelectedAsset?.id === asset.id) {
      rebuildClipTimeline();
    }

    closeTrimModal();
  };

  btnTrimSave.addEventListener("click", onSaveClick);

  // Show Modal
  trimModal.style.display = "flex";
}

