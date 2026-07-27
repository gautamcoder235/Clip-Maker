import { convertFileSrc } from "@tauri-apps/api/core";
import { AppStateManager } from "./state/app_state";
import { CanvasRenderer } from "./editor/canvas";
import { DOMOverlay } from "./editor/dom_overlay";
import { CanvasContextMenu } from "./editor/context_menu";
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
let btnRatioLock: HTMLButtonElement;
let propAspectRatio: HTMLSelectElement;
let propCropAnchor: HTMLSelectElement;
let propResolution: HTMLSelectElement;
let propTextEnabled: HTMLInputElement;
let primaryTextControls: HTMLDivElement;
let propTextTemplate: HTMLInputElement;
let propFontSize: HTMLInputElement;
let propFontColor: HTMLInputElement;
let propFontFamily: HTMLSelectElement;
let propTextOutline: HTMLInputElement;
let propLetterSpacing: HTMLInputElement;
let propFontWeight: HTMLInputElement;
let letterSpacingValue: HTMLSpanElement;
let fontWeightValue: HTMLSpanElement;
let btnLivePreview: HTMLButtonElement;
let previewModal: HTMLDivElement;
let previewVideo: HTMLVideoElement;
let btnPreviewClose: HTMLButtonElement;
let btnPreviewRefresh: HTMLButtonElement;
let previewStatus: HTMLSpanElement;
let btnPreviewPlayPause: HTMLButtonElement;
let previewPlayIcon: HTMLElement;
let previewPauseIcon: HTMLElement;
let previewTimeDisplay: HTMLSpanElement;
let previewSeekSlider: HTMLInputElement;
let btnPreviewMute: HTMLButtonElement;
let previewVolumeIconOn: HTMLElement;
let previewVolumeIconOff: HTMLElement;
let previewVolumeSlider: HTMLInputElement;
let btnPreviewFullscreen: HTMLButtonElement;
let btnExportZip: HTMLButtonElement;
let queueEtaBanner: HTMLSpanElement;
let propGpuAccel: HTMLInputElement;

let propIncludeAudio: HTMLInputElement;
let propClipDuration: HTMLInputElement;
let propExportScope: HTMLSelectElement;
let exportRangeRow: HTMLDivElement;

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
let propExtraLetterSpacing: HTMLInputElement;
let extraLetterSpacingValue: HTMLSpanElement;
let propExtraFontWeight: HTMLInputElement;
let extraFontWeightValue: HTMLSpanElement;
let btnAddExtra: HTMLButtonElement;


let btnRemoveExtra: HTMLButtonElement;

// Media Overlays
let listMediaOverlays: HTMLSelectElement;
let propMediaType: HTMLSelectElement;
let propMediaLoop: HTMLSelectElement;
let propMediaChroma: HTMLInputElement;
let propMediaSimilarity: HTMLInputElement;
let propMediaBlend: HTMLInputElement;
let propMediaChromaColor: HTMLInputElement;
let btnAddMedia: HTMLButtonElement;
let btnEditMediaPopup: HTMLButtonElement;
let btnRemoveMedia: HTMLButtonElement;

// Media Settings Modal elements
let mediaSettingsModal: HTMLDivElement;
let mediaModalFilename: HTMLSpanElement;
let mediaModalChromaColorBtn: HTMLButtonElement;
let mediaModalChromaColorHex: HTMLInputElement;
let btnMediaModalCancel: HTMLButtonElement;
let btnMediaModalSave: HTMLButtonElement;

// Text Edit Modal elements
let textEditModal: HTMLDivElement;
let textEditInput: HTMLInputElement;
let btnTextEditCancel: HTMLButtonElement;
let btnTextEditSave: HTMLButtonElement;

// Advanced
let propParallel: HTMLInputElement;
let propWorkers: HTMLInputElement;


let txtQueueStatus: HTMLSpanElement;
let selectTheme: HTMLSelectElement;
let btnUserManual: HTMLButtonElement;

// Trim Modal elements
let trimModal: HTMLDivElement;
let trimModalVideo: HTMLVideoElement;
let trimModalFilename: HTMLSpanElement;
let trimLoadingOverlay: HTMLDivElement;
let trimTimelineTrack: HTMLDivElement;
let trimTimelineRange: HTMLDivElement;
let trimHandleLeft: HTMLDivElement;
let trimHandleRight: HTMLDivElement;
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

let trimVideoPlayBtn: HTMLButtonElement;
let trimPlayIcon: SVGElement;
let trimVideoTimeDisplay: HTMLDivElement;
let trimVideoProgress: HTMLInputElement;
let trimVideoVolumeBtn: HTMLButtonElement;
let trimVolumeIcon: SVGElement;
let trimVolumeSlider: HTMLInputElement;
let trimVolumeText: HTMLSpanElement;
let savedVolume = 100;

// Panel Toggles
let btnToggleLeft: HTMLButtonElement;
let btnToggleBottom: HTMLButtonElement;
let isLeftPanelVisible = true;
let isBottomPanelVisible = true;

// Command Palette
let btnCommandPalette: HTMLButtonElement;
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

function syncRatioLockUI(target: string | null = domOverlay?.getFocusedElement()) {
  const isLocked = domOverlay ? domOverlay.getElementRatioLocked(target) : (stateManager.project.video_placement?.ratio_locked !== false);
  if (btnRatioLock) {
    btnRatioLock.classList.toggle("active", isLocked);
    btnRatioLock.title = isLocked ? "Unlock aspect ratio" : "Lock aspect ratio";
  }
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
  btnRatioLock = document.querySelector("#btn-ratio-lock")!;
  propAspectRatio = document.querySelector("#prop-aspect-ratio")!;
  propCropAnchor = document.querySelector("#prop-crop-anchor")!;
  propResolution = document.querySelector("#prop-resolution")!;
  propTextEnabled = document.querySelector("#prop-text-enabled")!;
  primaryTextControls = document.querySelector("#primary-text-controls")!;
  propTextTemplate = document.querySelector("#prop-text-template")!;
  propFontSize = document.querySelector("#prop-font-size")!;
  propFontColor = document.querySelector("#prop-font-color")!;
  propFontFamily = document.querySelector("#prop-font-family")!;
  propTextOutline = document.querySelector("#prop-text-outline")!;
  propLetterSpacing = document.querySelector("#prop-letter-spacing")!;
  propFontWeight = document.querySelector("#prop-font-weight")!;
  letterSpacingValue = document.querySelector("#letter-spacing-value")!;
  fontWeightValue = document.querySelector("#font-weight-value")!;
  btnLivePreview = document.querySelector("#btn-live-preview")!;
  previewModal = document.querySelector("#preview-modal")!;
  previewVideo = document.querySelector("#preview-video")!;
  btnPreviewClose = document.querySelector("#btn-preview-close")!;
  btnPreviewRefresh = document.querySelector("#btn-preview-refresh")!;
  previewStatus = document.querySelector("#preview-status")!;
  btnPreviewPlayPause = document.querySelector("#btn-preview-play-pause")!;
  previewPlayIcon = document.querySelector("#preview-play-icon")!;
  previewPauseIcon = document.querySelector("#preview-pause-icon")!;
  previewTimeDisplay = document.querySelector("#preview-time-display")!;
  previewSeekSlider = document.querySelector("#preview-seek-slider")!;
  btnPreviewMute = document.querySelector("#btn-preview-mute")!;
  previewVolumeIconOn = document.querySelector("#preview-volume-icon-on")!;
  previewVolumeIconOff = document.querySelector("#preview-volume-icon-off")!;
  previewVolumeSlider = document.querySelector("#preview-volume-slider")!;
  btnPreviewFullscreen = document.querySelector("#btn-preview-fullscreen")!;
  btnExportZip = document.querySelector("#btn-export-zip")!;
  queueEtaBanner = document.querySelector("#queue-eta-banner")!;
  propGpuAccel = document.querySelector("#prop-gpu-accel")!;

  propIncludeAudio = document.querySelector("#prop-include-audio")!;
  propClipDuration = document.querySelector("#prop-clip-duration")!;
  propExportScope = document.querySelector("#prop-export-scope")!;
  exportRangeRow = document.querySelector("#export-range-row")!;

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
  propExtraLetterSpacing = document.querySelector("#prop-extra-letter-spacing")!;
  extraLetterSpacingValue = document.querySelector("#extra-letter-spacing-value")!;
  propExtraFontWeight = document.querySelector("#prop-extra-font-weight")!;
  extraFontWeightValue = document.querySelector("#extra-font-weight-value")!;
  btnAddExtra = document.querySelector("#btn-add-extra")!;


  btnRemoveExtra = document.querySelector("#btn-remove-extra")!;

  listMediaOverlays = document.querySelector("#list-media-overlays")!;
  propMediaType = document.querySelector("#media-modal-type")!;
  propMediaLoop = document.querySelector("#media-modal-loop")!;
  propMediaChroma = document.querySelector("#media-modal-chroma")!;
  propMediaSimilarity = document.querySelector("#media-modal-similarity")!;
  propMediaBlend = document.querySelector("#media-modal-blend")!;
  propMediaChromaColor = document.querySelector("#media-modal-chroma-color")!;
  btnAddMedia = document.querySelector("#btn-add-media")!;
  btnEditMediaPopup = document.querySelector("#btn-edit-media-popup")!;
  btnRemoveMedia = document.querySelector("#btn-remove-media")!;

  // Bind Media Settings Modal elements
  mediaSettingsModal = document.querySelector("#media-settings-modal")!;
  mediaModalFilename = document.querySelector("#media-modal-filename")!;
  mediaModalChromaColorBtn = document.querySelector("#media-modal-chroma-color-btn")!;
  mediaModalChromaColorHex = document.querySelector("#media-modal-chroma-color-hex")!;
  btnMediaModalCancel = document.querySelector("#media-modal-cancel")!;
  btnMediaModalSave = document.querySelector("#media-modal-save")!;

  // Bind Text Edit Modal elements
  textEditModal = document.querySelector("#text-edit-modal")!;
  textEditInput = document.querySelector("#text-edit-input")!;
  btnTextEditCancel = document.querySelector("#text-edit-cancel")!;
  btnTextEditSave = document.querySelector("#text-edit-save")!;

  propParallel = document.querySelector("#prop-parallel")!;
  propWorkers = document.querySelector("#prop-workers")!;


  txtQueueStatus = document.querySelector("#txt-queue-status")!;
  selectTheme = document.querySelector("#select-theme")!;
  btnUserManual = document.querySelector("#btn-user-manual")!;

  btnToggleLeft = document.querySelector("#btn-toggle-left")!;
  btnToggleBottom = document.querySelector("#btn-toggle-bottom")!;

  btnCommandPalette = document.querySelector("#btn-command-palette")!;
  commandPalette = document.querySelector("#command-palette")!;
  paletteSearch = document.querySelector("#palette-search")!;
  paletteResults = document.querySelector("#palette-results")!;



  // Bind Trim Modal elements
  trimModal = document.querySelector("#trim-modal")!;
  trimModalVideo = document.querySelector("#trim-modal-video")!;
  trimModalFilename = document.querySelector("#trim-modal-filename")!;
  trimLoadingOverlay = document.querySelector("#trim-loading-overlay")!;
  trimTimelineTrack = document.querySelector("#trim-timeline-track")!;
  trimTimelineRange = document.querySelector("#trim-timeline-range")!;
  trimHandleLeft = document.querySelector("#trim-handle-left")!;
  trimHandleRight = document.querySelector("#trim-handle-right")!;
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
  
  // Custom video controls elements
  trimVideoPlayBtn = document.querySelector("#trim-video-play-btn")!;
  trimPlayIcon = document.querySelector("#trim-play-icon")!;
  trimVideoTimeDisplay = document.querySelector("#trim-video-time-display")!;
  trimVideoProgress = document.querySelector("#trim-video-progress")!;
  trimVideoVolumeBtn = document.querySelector("#trim-video-volume-btn")!;
  trimVolumeIcon = document.querySelector("#trim-volume-icon")!;
  trimVolumeSlider = document.querySelector("#trim-volume-slider")!;
  trimVolumeText = document.querySelector(".trim-volume-text")!;

  // Initialize Services
  stateManager = new AppStateManager();
  await stateManager.init();

  canvasRenderer = new CanvasRenderer(canvasViewport);
  domOverlay = new DOMOverlay(domOverlayContainer, stateManager);
  domOverlay.onFocusChange((focused) => {
    syncRatioLockUI(focused);
  });
  new CanvasContextMenu(domOverlayContainer, stateManager, domOverlay, {
    syncExtraOverlaysList,
    syncMediaOverlaysList,
    refreshViewport,
    showToast,
    addMediaOverlayPrompt: async () => {
      try {
        const path = await invoke<string>("select_video_file");
        return path || null;
      } catch (err) {
        showToast(`Browse failed: ${err}`, "error");
        return null;
      }
    },
    openMediaSettingsModal: (idx: number) => {
      openMediaSettingsModal(idx);
    },
    openTextEditModal: (type: string) => {
      openTextEditModal(type);
    }
  });

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
    showToast(`Switched theme to ${selectTheme.options[selectTheme.selectedIndex]?.text || selected}`, "success");
  });

  // Initialize custom glassmorphism theme dropdown UI
  setupCustomThemeDropdown();


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
    saveActiveAssetSettings();
    syncConfigToUi();
    
    // Refresh asset list display on state change (e.g. undo/redo of trim settings)
    const activeScroll = assetListContainer.scrollTop;
    assetListContainer.innerHTML = "";
    stateManager.assets.forEach(a => appendAssetCard(a));
    highlightActiveAssetCard();
    assetListContainer.scrollTop = activeScroll;

    // Refresh clip timeline parts count
    rebuildClipTimeline();

    refreshViewport();
  });

  // Event handlers
  btnImport.addEventListener("click", triggerImport);
  btnExportAll.addEventListener("click", startBatchExport);
  propExportScope.addEventListener("change", () => {
    if (propExportScope.value === "all") {
      exportRangeRow.style.display = "none";
    } else {
      exportRangeRow.style.display = "flex";
    }
  });
  btnCancelAll.addEventListener("click", cancelAllRenders);
  btnClearCache.addEventListener("click", clearCacheDir);

  btnUndo.addEventListener("click", () => stateManager.history.undo());
  btnRedo.addEventListener("click", () => stateManager.history.redo());

  btnNewProject.addEventListener("click", triggerNewProject);
  btnOpenProject.addEventListener("click", triggerOpenProject);
  btnSaveProject.addEventListener("click", triggerSaveProject);

  tabClipQueue.addEventListener("click", () => switchBottomTab("clips"));
  tabRenderQueue.addEventListener("click", () => switchBottomTab("render"));

  // Input changes bindings
  bindInputFields();

  // Overlay movements updater
  domOverlay.onLayoutChange(() => {
    const bounds = domOverlay.getFocusedElementBounds();
    if (bounds) {
      propPlacementX.value = bounds.x.toString();
      propPlacementY.value = bounds.y.toString();
      propPlacementW.value = bounds.width.toString();
      propPlacementH.value = bounds.height.toString();
    } else {
      propPlacementX.value = stateManager.project.video_placement.x.toString();
      propPlacementY.value = stateManager.project.video_placement.y.toString();
      propPlacementW.value = stateManager.project.video_placement.width.toString();
      propPlacementH.value = stateManager.project.video_placement.height.toString();
    }
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
    if (!target.closest(".editor-interactive-box") && 
        !target.closest("#right-panel") && 
        !target.closest(".playback-controls") &&
        !target.closest("#custom-color-picker-popover") &&
        !target.closest(".font-picker-dropdown") &&
        !target.closest(".context-menu")) {
      domOverlay.setFocusedElement(null);
    }
  });

  refreshViewport();

  // Check for auto-saved project on startup
  const loadedAutosave = await tryLoadAutosave();
  if (!loadedAutosave) {
    toggleDashboard(true);
  }

  // Splash Screen Intro Animation sequence
  const splashText = document.querySelector(".splash-loading-text") as HTMLElement | null;
  const updateSplashText = (text: string) => {
    if (!splashText) return;
    splashText.classList.add("text-fade-out");
    setTimeout(() => {
      splashText.textContent = text;
      splashText.classList.remove("text-fade-out");
    }, 250);
  };

  if (splashText) {
    setTimeout(() => { updateSplashText("Loading system presets..."); }, 400);
    setTimeout(() => { updateSplashText("Checking GPU hardware acceleration..."); }, 900);
    setTimeout(() => { updateSplashText("Initializing workspace layers..."); }, 1400);
    setTimeout(() => { updateSplashText("Creative engine ready!"); }, 1900);
  }

  setTimeout(() => {
    const splash = document.getElementById("app-splash-screen");
    if (splash) {
      splash.classList.add("fade-out");
      setTimeout(() => {
        splash.remove();
        showToast("Clip Maker successfully initialized!", "success");
      }, 700);
    }
  }, 2400);

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

  // Customize all type="number" inputs dynamically
  customizeNumberInputs();
});

function syncConfigToUi() {
  const proj = stateManager.project;
  
  btnUndo.disabled = !stateManager.history.canUndo();
  btnRedo.disabled = !stateManager.history.canRedo();

  propPlacementX.value = proj.video_placement.x.toString();
  propPlacementY.value = proj.video_placement.y.toString();
  propPlacementW.value = proj.video_placement.width.toString();
  propPlacementH.value = proj.video_placement.height.toString();

  syncRatioLockUI();

  propAspectRatio.value = proj.aspect_ratio;
  propCropAnchor.value = proj.crop_anchor;
  propResolution.value = proj.output_resolution;
  const textEnabled = proj.text_settings.enabled !== false;
  propTextEnabled.checked = textEnabled;
  primaryTextControls.style.opacity = textEnabled ? "1" : "0.5";
  primaryTextControls.style.pointerEvents = textEnabled ? "auto" : "none";

  propTextTemplate.value = proj.text_template;
  propFontSize.value = proj.text_settings.font_size.toString();
  propFontColor.value = proj.text_settings.font_color;
  propTextOutline.checked = proj.text_settings.outline ?? true;
  if (propLetterSpacing) {
    propLetterSpacing.value = (proj.text_settings.letter_spacing || 0).toString();
    if (letterSpacingValue) letterSpacingValue.innerText = (proj.text_settings.letter_spacing || 0).toString();
  }
  if (propFontWeight) {
    propFontWeight.value = (proj.text_settings.font_weight || 400).toString();
    if (fontWeightValue) fontWeightValue.innerText = (proj.text_settings.font_weight || 400).toString();
  }
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


  // Sync Lists
  syncPresetsList();
  syncExtraOverlaysList();
  syncMediaOverlaysList();
  syncColorPreviewButtons();
}

function resetProjectSession() {
  stateManager.project = stateManager.createDefaultProject();
  stateManager.history.clear();
  stateManager.assets = [];
  currentSelectedAsset = null;
  activeJobUis.clear();
  stateManager.renderQueue = [];
  updateRenderStats();

  assetListContainer.innerHTML = "";
  clipsGridContainer.innerHTML = "";
  jobsListContainer.innerHTML = "";

  canvasRenderer.clearVideo();
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
    if (domOverlay.getFocusedElement()) {
      domOverlay.updateFocusedElementBounds({ x: val });
    } else {
      const placement = { ...stateManager.project.video_placement, x: val };
      stateManager.updateProjectField("video_placement", placement);
    }
  });
  propPlacementY.addEventListener("change", () => {
    const val = parseInt(propPlacementY.value) || 0;
    if (domOverlay.getFocusedElement()) {
      domOverlay.updateFocusedElementBounds({ y: val });
    } else {
      const placement = { ...stateManager.project.video_placement, y: val };
      stateManager.updateProjectField("video_placement", placement);
    }
  });
  // Ratio lock toggle
  btnRatioLock.addEventListener("click", () => {
    const target = domOverlay.getFocusedElement() || "video";
    const isLocked = !domOverlay.getElementRatioLocked(target);

    domOverlay.setElementRatioLocked(target, isLocked);
    syncRatioLockUI(target);

    if (isLocked) {
      const ratio = domOverlay.getNaturalRatio(target);
      if (ratio !== null && ratio > 0) {
        if (target === "video") {
          const p = stateManager.project.video_placement;
          const newH = Math.round(p.width / ratio);
          propPlacementH.value = newH.toString();
          const placementWithH = { ...p, height: newH, ratio_locked: true };
          stateManager.updateProjectField("video_placement", placementWithH);
        } else if (target.startsWith("media-")) {
          const bounds = domOverlay.getFocusedElementBounds();
          if (bounds) {
            const newH = Math.round(bounds.width / ratio);
            propPlacementH.value = newH.toString();
            domOverlay.updateFocusedElementBounds({ width: bounds.width, height: newH });
          }
        }
        refreshViewport();
      }
    }
  });

  propPlacementW.addEventListener("change", () => {
    const val = parseInt(propPlacementW.value) || 1080;
    const focused = domOverlay.getFocusedElement() || "video";
    const isLocked = domOverlay.getElementRatioLocked(focused);
    if (focused !== "video") {
      const bounds = domOverlay.getFocusedElementBounds();
      if (isLocked && bounds && bounds.width > 0) {
        const ratio = domOverlay.getNaturalRatio(focused) || (bounds.width / bounds.height);
        const newH = Math.round(val / ratio);
        propPlacementH.value = newH.toString();
        domOverlay.updateFocusedElementBounds({ width: val, height: newH });
      } else {
        domOverlay.updateFocusedElementBounds({ width: val });
      }
    } else {
      const p = stateManager.project.video_placement;
      if (isLocked && p.width > 0) {
        const ratio = domOverlay.getNaturalRatio("video") || (p.width / p.height);
        const newH = Math.round(val / ratio);
        propPlacementH.value = newH.toString();
        const placement = { ...p, width: val, height: newH };
        stateManager.updateProjectField("video_placement", placement);
      } else {
        const placement = { ...p, width: val };
        stateManager.updateProjectField("video_placement", placement);
      }
    }
  });
  propPlacementH.addEventListener("change", () => {
    const val = parseInt(propPlacementH.value) || 1920;
    const focused = domOverlay.getFocusedElement() || "video";
    const isLocked = domOverlay.getElementRatioLocked(focused);
    if (focused !== "video") {
      const bounds = domOverlay.getFocusedElementBounds();
      if (isLocked && bounds && bounds.height > 0) {
        const ratio = domOverlay.getNaturalRatio(focused) || (bounds.width / bounds.height);
        const newW = Math.round(val * ratio);
        propPlacementW.value = newW.toString();
        domOverlay.updateFocusedElementBounds({ width: newW, height: val });
      } else {
        domOverlay.updateFocusedElementBounds({ height: val });
      }
    } else {
      const p = stateManager.project.video_placement;
      if (isLocked && p.height > 0) {
        const ratio = domOverlay.getNaturalRatio("video") || (p.width / p.height);
        const newW = Math.round(val * ratio);
        propPlacementW.value = newW.toString();
        const placement = { ...p, width: newW, height: val };
        stateManager.updateProjectField("video_placement", placement);
      } else {
        const placement = { ...p, height: val };
        stateManager.updateProjectField("video_placement", placement);
      }
    }
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
  
  propTextEnabled.addEventListener("change", () => {
    const textSettings = { ...stateManager.project.text_settings, enabled: propTextEnabled.checked };
    stateManager.updateProjectField("text_settings", textSettings);
    primaryTextControls.style.opacity = propTextEnabled.checked ? "1" : "0.5";
    primaryTextControls.style.pointerEvents = propTextEnabled.checked ? "auto" : "none";
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

  propTextOutline.addEventListener("change", () => {
    const textSettings = { ...stateManager.project.text_settings, outline: propTextOutline.checked };
    stateManager.updateProjectField("text_settings", textSettings);
    refreshViewport();
  });

  propLetterSpacing.addEventListener("input", () => {
    const val = parseInt(propLetterSpacing.value) || 0;
    if (letterSpacingValue) letterSpacingValue.innerText = val.toString();
    const textSettings = { ...stateManager.project.text_settings, letter_spacing: val };
    stateManager.updateProjectField("text_settings", textSettings);
    refreshViewport();
  });

  propFontWeight.addEventListener("input", () => {
    const val = parseInt(propFontWeight.value) || 400;
    if (fontWeightValue) fontWeightValue.innerText = val.toString();
    const textSettings = { ...stateManager.project.text_settings, font_weight: val };
    stateManager.updateProjectField("text_settings", textSettings);
    refreshViewport();
  });

  // Panel Toggle & Command Palette listeners
  if (btnToggleLeft) {
    btnToggleLeft.addEventListener("click", () => toggleLeftPanel());
  }
  if (btnToggleBottom) {
    btnToggleBottom.addEventListener("click", () => toggleBottomPanel());
  }
  if (btnCommandPalette) {
    btnCommandPalette.addEventListener("click", () => toggleCommandPalette());
  }


  // Live Preview Modal listeners
  btnLivePreview.addEventListener("click", async (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    previewModal.style.display = "flex";
    await generateAndShowPreview();
  });




  btnPreviewClose.addEventListener("click", () => {
    previewModal.style.display = "none";
    if (previewVideo) {
      previewVideo.pause();
      previewVideo.src = "";
    }
  });

  const btnPreviewImport = document.getElementById("btn-preview-import");
  if (btnPreviewImport) {
    btnPreviewImport.addEventListener("click", () => {
      previewModal.style.display = "none";
      triggerImport();
    });
  }

  if (btnPreviewRefresh) {
    btnPreviewRefresh.addEventListener("click", async () => {
      if (previewStatus) previewStatus.innerText = "Refreshing...";
      await TauriService.clearCache();
      await generateAndShowPreview();
    });
  }

  // Custom Modern Video Player Controls
  if (btnPreviewPlayPause) {
    btnPreviewPlayPause.addEventListener("click", () => {
      if (!previewVideo) return;
      if (previewVideo.paused) {
        previewVideo.play().catch(err => console.warn(err));
      } else {
        previewVideo.pause();
      }
    });
  }

  if (previewVideo) {
    previewVideo.addEventListener("play", () => {
      if (previewPlayIcon) previewPlayIcon.style.display = "none";
      if (previewPauseIcon) previewPauseIcon.style.display = "inline-block";
    });

    previewVideo.addEventListener("pause", () => {
      if (previewPlayIcon) previewPlayIcon.style.display = "inline-block";
      if (previewPauseIcon) previewPauseIcon.style.display = "none";
    });

    previewVideo.addEventListener("timeupdate", () => {
      const current = previewVideo.currentTime || 0;
      const duration = previewVideo.duration || 0;
      if (previewTimeDisplay) {
        previewTimeDisplay.textContent = `${formatDuration(current)} / ${formatDuration(duration)}`;
      }
      if (duration > 0 && previewSeekSlider) {
        const pct = (current / duration) * 100;
        previewSeekSlider.value = pct.toString();
      }
    });
  }

  if (previewSeekSlider) {
    previewSeekSlider.addEventListener("input", () => {
      if (!previewVideo) return;
      const pct = parseFloat(previewSeekSlider.value) || 0;
      const duration = previewVideo.duration || 0;
      if (duration > 0) {
        previewVideo.currentTime = (pct / 100) * duration;
      }
    });
  }

  const updateVolumeUI = () => {
    if (!previewVideo) return;
    const isMuted = previewVideo.muted || previewVideo.volume === 0;
    if (previewVolumeIconOn) previewVolumeIconOn.style.display = isMuted ? "none" : "inline-block";
    if (previewVolumeIconOff) previewVolumeIconOff.style.display = isMuted ? "inline-block" : "none";
  };

  if (btnPreviewMute) {
    btnPreviewMute.addEventListener("click", () => {
      if (!previewVideo) return;
      previewVideo.muted = !previewVideo.muted;
      updateVolumeUI();
    });
  }

  if (previewVolumeSlider) {
    previewVolumeSlider.addEventListener("input", () => {
      if (!previewVideo) return;
      const vol = parseFloat(previewVolumeSlider.value) || 0;
      previewVideo.volume = vol;
      previewVideo.muted = vol === 0;
      updateVolumeUI();
    });
  }

  if (btnPreviewFullscreen) {
    btnPreviewFullscreen.addEventListener("click", () => {
      const container = document.querySelector(".preview-video-wrapper") as HTMLElement | null;
      if (container) {
        if (!document.fullscreenElement) {
          container.requestFullscreen().catch(err => console.warn(err));
        } else {
          document.exitFullscreen().catch(err => console.warn(err));
        }
      }
    });
  }




  // Export ZIP button listener
  btnExportZip.addEventListener("click", async () => {
    try {
      const completedJobs = stateManager.renderQueue.filter(j => j.status === "Completed");
      if (completedJobs.length === 0) {
        showToast("No completed clips to zip", "warning");
        return;
      }
      const clipPaths = completedJobs.map(j => j.output_file);
      const defaultName = currentSelectedAsset
        ? `${currentSelectedAsset.name.replace(/\.[^/.]+$/, "")}_clips.zip`
        : "clips_bundle.zip";

      const zipPath = await invoke<string>("select_zip_file", { defaultName });
      if (!zipPath) return; // User cancelled dialog

      showToast("Creating ZIP package...", "warning");
      await TauriService.exportClipsAsZip(clipPaths, zipPath);
      const fileName = zipPath.split(/[/\\]/).pop();
      showToast(`ZIP created successfully: ${fileName}`, "success");
    } catch (err: any) {
      const errMsg = typeof err === "object"
        ? (err.Config || err.message || JSON.stringify(err))
        : String(err);
      showToast(`ZIP export failed: ${errMsg}`, "error");
    }
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
      const bg = { ...stateManager.project.background, mode: "image", image_path: path };
      stateManager.updateProjectField("background", bg);
      if (propBgMode) propBgMode.value = "image";
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
      if (propLetterSpacing) {
        propLetterSpacing.value = (preset.letter_spacing || 0).toString();
        if (letterSpacingValue) letterSpacingValue.innerText = (preset.letter_spacing || 0).toString();
      }
      if (propFontWeight) {
        propFontWeight.value = (preset.font_weight || 400).toString();
        if (fontWeightValue) fontWeightValue.innerText = (preset.font_weight || 400).toString();
      }
      // Sync font picker display
      const pv = document.querySelector("#font-picker-primary .font-picker-value") as HTMLSpanElement;
      if (pv) { pv.textContent = preset.font_family; pv.style.fontFamily = preset.font_family; }
      
      const settings = {
        ...stateManager.project.text_settings,
        font_size: preset.font_size,
        font_color: preset.font_color,
        font_family: preset.font_family,
        outline: preset.outline,
        letter_spacing: preset.letter_spacing || 0,
        font_weight: preset.font_weight || 400
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
      y_position: currentSettings.y_position,
      letter_spacing: currentSettings.letter_spacing || 0,
      font_weight: currentSettings.font_weight || 400
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
      if (propExtraLetterSpacing) {
        propExtraLetterSpacing.value = (overlay.letter_spacing || 0).toString();
        if (extraLetterSpacingValue) extraLetterSpacingValue.innerText = `${overlay.letter_spacing || 0}px`;
      }
      if (propExtraFontWeight) {
        propExtraFontWeight.value = (overlay.font_weight || 400).toString();
        if (extraFontWeightValue) extraFontWeightValue.innerText = (overlay.font_weight || 400).toString();
      }
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

  propExtraLetterSpacing.addEventListener("input", () => {
    const val = parseInt(propExtraLetterSpacing.value) || 0;
    if (extraLetterSpacingValue) extraLetterSpacingValue.innerText = `${val}px`;
    const idx = parseInt(listExtraOverlays.value);
    if (!isNaN(idx)) {
      const overlays = [...(stateManager.project.extra_overlays || [])];
      if (overlays[idx]) {
        overlays[idx].letter_spacing = val;
        stateManager.updateProjectField("extra_overlays", overlays);
        refreshViewport();
      }
    }
  });

  propExtraFontWeight.addEventListener("input", () => {
    const val = parseInt(propExtraFontWeight.value) || 400;
    if (extraFontWeightValue) extraFontWeightValue.innerText = val.toString();
    const idx = parseInt(listExtraOverlays.value);
    if (!isNaN(idx)) {
      const overlays = [...(stateManager.project.extra_overlays || [])];
      if (overlays[idx]) {
        overlays[idx].font_weight = val;
        stateManager.updateProjectField("extra_overlays", overlays);
        refreshViewport();
      }
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
      outline: propExtraOutline.checked,
      letter_spacing: parseInt(propExtraLetterSpacing?.value || "0"),
      font_weight: parseInt(propExtraFontWeight?.value || "400")
    });
    
    const order = [...stateManager.getNormalizedOverlayOrder(), `extra-${overlays.length - 1}`];
    
    stateManager.updateProjectField("extra_overlays", overlays);
    stateManager.updateProjectField("overlay_order", order);
    syncExtraOverlaysList();
    refreshViewport();
    showToast("Added extra text overlay!", "success");
  });


  btnRemoveExtra.addEventListener("click", () => {
    const idx = parseInt(listExtraOverlays.value);
    if (isNaN(idx)) return;
    const overlays = [...(stateManager.project.extra_overlays || [])];
    overlays.splice(idx, 1);
    
    const order = [...stateManager.getNormalizedOverlayOrder()];
    const targetId = `extra-${idx}`;
    const newOrder = order
      .filter(id => id !== targetId)
      .map(id => {
        if (id.startsWith("extra-")) {
          const itemIdx = parseInt(id.split("-")[1]);
          return itemIdx > idx ? `extra-${itemIdx - 1}` : id;
        }
        return id;
      });

    stateManager.updateProjectField("extra_overlays", overlays);
    stateManager.updateProjectField("overlay_order", newOrder);
    syncExtraOverlaysList();
    refreshViewport();
    showToast("Removed extra text overlay", "warning");
  });

  // Live updates for extra overlays
  const updateActiveExtraOverlay = () => {
    const idx = parseInt(listExtraOverlays.value);
    if (isNaN(idx)) return;
    const overlays = [...(stateManager.project.extra_overlays || [])];
    if (overlays[idx]) {
      overlays[idx].text = propExtraText.value || overlays[idx].text;
      overlays[idx].font_size = parseInt(propExtraFontSize.value) || 80;
      overlays[idx].font_color = propExtraFontColor.value;
      overlays[idx].font_family = propExtraFontFamily.value;
      overlays[idx].outline = propExtraOutline.checked;
      stateManager.updateProjectField("extra_overlays", overlays);
      
      // Update select option text
      const opt = listExtraOverlays.options[idx];
      if (opt) {
        const txtSnippet = overlays[idx].text.length > 15 ? overlays[idx].text.substring(0, 15) + "..." : overlays[idx].text;
        opt.innerText = `${overlays[idx].name || `Overlay ${idx + 1}`} ("${txtSnippet}")`;
      }
      
      refreshViewport();
    }
  };

  propExtraText.addEventListener("input", updateActiveExtraOverlay);
  propExtraFontSize.addEventListener("input", updateActiveExtraOverlay);
  propExtraFontColor.addEventListener("input", updateActiveExtraOverlay);
  propExtraFontFamily.addEventListener("change", updateActiveExtraOverlay);
  propExtraOutline.addEventListener("change", updateActiveExtraOverlay);

  // Media Overlays
  listMediaOverlays.addEventListener("change", () => {
    const idx = parseInt(listMediaOverlays.value);
    const overlays = stateManager.project.media_overlays || [];
    const overlay = overlays[idx];
    if (overlay) {
      domOverlay.setFocusedElement(`media-${idx}`);
    }
  });
  btnAddMedia.addEventListener("click", async () => {
    try {
      const path = await invoke<string>("select_video_file");
      if (!path || path.trim() === "") return;
      
      const ext = path.split(".").pop()?.toLowerCase();
      const type = (ext === "mp4" || ext === "webm" || ext === "mov") ? "video" : "image";
      
      const overlays = [...(stateManager.project.media_overlays || [])];
      const newIdx = overlays.length;
      overlays.push({
        name: `Media ${newIdx + 1}`,
        type: type,
        path: path,
        x: 50,
        y: 50,
        width: 320,
        height: 180,
        enabled: true,
        loop_mode: "repeat",
        chroma_key: false,
        chroma_color: "#00ff00",
        chroma_similarity: 0.3,
        chroma_blend: 0.05
      });
      
      const order = [...stateManager.getNormalizedOverlayOrder(), `media-${newIdx}`];
      
      stateManager.updateProjectField("media_overlays", overlays);
      stateManager.updateProjectField("overlay_order", order);
      syncMediaOverlaysList();
      refreshViewport();
      showToast("Added media overlay!", "success");

      // Auto-select and open settings modal
      listMediaOverlays.value = newIdx.toString();
      domOverlay.setFocusedElement(`media-${newIdx}`);
      openMediaSettingsModal(newIdx);
    } catch (err) {
      showToast(`Add media failed: ${err}`, "error");
    }
  });
  btnEditMediaPopup.addEventListener("click", () => {
    const idx = parseInt(listMediaOverlays.value);
    if (isNaN(idx)) {
      showToast("Select a media overlay to edit first!", "warning");
      return;
    }
    openMediaSettingsModal(idx);
  });
  btnRemoveMedia.addEventListener("click", () => {
    const idx = parseInt(listMediaOverlays.value);
    if (isNaN(idx)) return;
    const overlays = [...(stateManager.project.media_overlays || [])];
    overlays.splice(idx, 1);
    
    const order = [...stateManager.getNormalizedOverlayOrder()];
    const targetId = `media-${idx}`;
    const newOrder = order
      .filter(id => id !== targetId)
      .map(id => {
        if (id.startsWith("media-")) {
          const itemIdx = parseInt(id.split("-")[1]);
          if (itemIdx > idx) {
            return `media-${itemIdx - 1}`;
          }
        }
        return id;
      });

    stateManager.updateProjectField("media_overlays", overlays);
    stateManager.updateProjectField("overlay_order", newOrder);
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

  

  // Focus video overlay when interacting with placement settings in inspector
  const videoInputs = [propPlacementX, propPlacementY, propPlacementW, propPlacementH, propAspectRatio, propCropAnchor, propResolution];
  videoInputs.forEach(input => {
    input.addEventListener("focus", () => {
      if (!domOverlay.getFocusedElement()) {
        domOverlay.setFocusedElement("video");
      }
    });
  });

  // Focus text overlay when interacting with text settings in inspector
  const textInputs = [propTextTemplate, propFontSize, propFontColor, propFontFamily, propTextOutline];
  textInputs.forEach(input => {
    input.addEventListener("focus", () => domOverlay.setFocusedElement("text"));
  });

  // Focus extra text overlay when interacting with extra text settings in inspector
  const extraTextInputs = [propExtraText, propExtraFontSize, propExtraFontColor, propExtraFontFamily, propExtraOutline];
  extraTextInputs.forEach(input => {
    input.addEventListener("focus", () => {
      const idx = parseInt(listExtraOverlays.value);
      if (!isNaN(idx)) domOverlay.setFocusedElement(`extra-${idx}`);
    });
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

    // Check if the file is already imported
    const existingAsset = stateManager.assets.find(a => a.path === path);
    if (existingAsset) {
      showToast("This video is already imported!", "warning");
      selectAsset(existingAsset);
      return;
    }
    
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

function highlightActiveAssetCard() {
  if (!currentSelectedAsset) return;
  document.querySelectorAll(".asset-card").forEach((c) => {
    const div = c as HTMLDivElement;
    if (div.dataset.hash === currentSelectedAsset!.hash) {
      div.style.borderColor = "var(--accent)";
      div.style.background = "rgba(255, 255, 255, 0.06)";
    } else {
      div.style.borderColor = "var(--panel-border)";
      div.style.background = "rgba(255, 255, 255, 0.02)";
    }
  });
}

function saveActiveAssetSettings() {
  if (!currentSelectedAsset) return;
  const id = currentSelectedAsset.id;
  if (!stateManager.project.asset_settings) {
    stateManager.project.asset_settings = {};
  }
  if (!stateManager.project.asset_settings[id]) {
    stateManager.project.asset_settings[id] = {};
  }
  
  const settings = stateManager.project.asset_settings[id];
  settings.video_placement = JSON.parse(JSON.stringify(stateManager.project.video_placement));
  settings.text_settings = JSON.parse(JSON.stringify(stateManager.project.text_settings));
  settings.text_template = stateManager.project.text_template;
  settings.extra_overlays = JSON.parse(JSON.stringify(stateManager.project.extra_overlays || []));
  settings.media_overlays = JSON.parse(JSON.stringify(stateManager.project.media_overlays || []));
}

function loadActiveAssetSettings(asset: ImportedAsset) {
  const id = asset.id;
  const settings = stateManager.project.asset_settings?.[id];
  
  if (settings) {
    if (settings.video_placement) {
      stateManager.project.video_placement = JSON.parse(JSON.stringify(settings.video_placement));
    }
    if (settings.text_settings) {
      stateManager.project.text_settings = JSON.parse(JSON.stringify(settings.text_settings));
    }
    if (settings.text_template !== undefined) {
      stateManager.project.text_template = settings.text_template;
    }
    if (settings.extra_overlays) {
      stateManager.project.extra_overlays = JSON.parse(JSON.stringify(settings.extra_overlays));
    } else {
      stateManager.project.extra_overlays = [];
    }
    if (settings.media_overlays) {
      stateManager.project.media_overlays = JSON.parse(JSON.stringify(settings.media_overlays));
    } else {
      stateManager.project.media_overlays = [];
    }
  } else {
    // Clean default settings for a newly loaded video asset
    stateManager.project.video_placement = {
      enabled: true,
      x: 0,
      y: 460,
      width: 1080,
      height: 1000
    };
    stateManager.project.text_settings = {
      enabled: true,
      font_size: 120,
      font_color: "#ffffff",
      font_family: "Arial",
      x_position: "center",
      y_position: "top",
      outline: true,
      placement: "Top"
    };
    stateManager.project.text_template = "PART {part}";
    stateManager.project.extra_overlays = [];
    stateManager.project.media_overlays = [];
  }
}

function selectAsset(asset: ImportedAsset, autoPlay = false) {
  if (currentSelectedAsset && currentSelectedAsset.id !== asset.id) {
    saveActiveAssetSettings();
  }

  currentSelectedAsset = asset;
  highlightActiveAssetCard();
  
  loadActiveAssetSettings(asset);

  // Update config paths
  stateManager.project.input_paths = [asset.path];
  stateManager.project.input_path = asset.path;

  // Re-resolve source dimensions if resolution is set to Source
  if (stateManager.project.output_resolution === "Source" && asset.metadata) {
    stateManager.project.output_width = asset.metadata.width;
    stateManager.project.output_height = asset.metadata.height;
  }

  // Adjust video placement box to match the loaded video's actual aspect ratio if not previously configured
  const hasSavedPlacement = !!stateManager.project.asset_settings?.[asset.id]?.video_placement;
  if (!hasSavedPlacement && asset.metadata && asset.metadata.width && asset.metadata.height) {
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
      ratio_locked: true,
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
    
    if (autoPlay) {
      canvasRenderer.play();
    } else {
      canvasRenderer.pause();
    }
  } catch (e) {
    console.error("Direct video source loading failed:", e);
  }
  
  refreshViewport();
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



async function startBatchExport() {
  if (stateManager.assets.length === 0) {
    showToast("Import at least one video asset first", "warning");
    return;
  }

  try {
    const outPath = await invoke<string>("select_output_folder");
    if (!outPath || outPath.trim() === "") return;

    stateManager.project.output_path = outPath;

    const scope = propExportScope.value; // "selected" | "all"
    let assetsToExport: ImportedAsset[] = [];

    if (scope === "all") {
      assetsToExport = stateManager.assets.filter(a => a.metadata !== null);
    } else {
      if (!currentSelectedAsset || !currentSelectedAsset.metadata) {
        showToast("Select a video asset first", "warning");
        return;
      }
      assetsToExport = [currentSelectedAsset];
    }

    if (assetsToExport.length === 0) {
      showToast("No valid assets with metadata to export", "warning");
      return;
    }

    // Switch to Render queue bottom tab
    switchBottomTab("render");

    let totalJobsQueued = 0;
    const batchRequests: { config: AppConfig; start_clip: number; end_clip: number }[] = [];

    for (const asset of assetsToExport) {
      if (!asset.metadata) continue;

      let duration = asset.metadata.duration;
      const settings = stateManager.project.asset_settings?.[asset.id];
      if (settings?.trim?.enabled) {
        duration = settings.trim.end - settings.trim.start;
      }
      const clipLength = stateManager.project.clip_duration || 50;
      const totalClips = Math.ceil(duration / clipLength);

      let startVal = 1;
      let endVal = totalClips;

      if (scope === "selected") {
        const exportFrom = document.getElementById("prop-export-from") as HTMLInputElement;
        const exportTo = document.getElementById("prop-export-to") as HTMLInputElement;
        if (exportFrom && exportTo) {
          startVal = Math.max(1, Math.min(totalClips, parseInt(exportFrom.value) || 1));
          endVal = Math.max(startVal, Math.min(totalClips, parseInt(exportTo.value) || totalClips));
        }
      }

      const exportCount = (endVal - startVal) + 1;
      totalJobsQueued += exportCount;

      const config: AppConfig = {
        ...stateManager.project,
        input_path: asset.path,
        input_paths: [asset.path],
        output_path: outPath,
      };


      if (settings) {
        if (settings.video_placement) config.video_placement = settings.video_placement;
        if (settings.text_settings) config.text_settings = settings.text_settings;
        if (settings.text_template !== undefined) config.text_template = settings.text_template;
        if (settings.extra_overlays) config.extra_overlays = settings.extra_overlays;
        if (settings.media_overlays) config.media_overlays = settings.media_overlays;
      }

      batchRequests.push({ config, start_clip: startVal, end_clip: endVal });
    }

    if (batchRequests.length > 0) {
      const jobIds = await TauriService.startBatchRenderQueue(batchRequests);
      
      // Populate active job cards
      jobIds.forEach(async (id) => {
        const job = await TauriService.getJobsList().then(list => list.find(j => j.id === id));
        if (job) {
          appendJobUi(job);
        }
      });
    }

    showToast(`Successfully queued ${totalJobsQueued} clips for export!`, "success");

  } catch (e) {
    showToast(`Export queue failed: ${e}`, "error");
  }
}

function formatEtaHuman(seconds: number | null): string {
  if (seconds === null || seconds === undefined || seconds <= 0) return "";
  if (seconds < 60) return `About ${Math.ceil(seconds)} sec left`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.ceil(seconds % 60);
  if (mins < 60) {
    return secs > 0 ? `About ${mins} min ${secs} sec left` : `About ${mins} min left`;
  }
  const hours = Math.floor(mins / 60);
  const remainMins = mins % 60;
  return `About ${hours}h ${remainMins}m left`;
}

async function generateAndShowPreview() {
  const loaderEl = document.getElementById("preview-loader");
  const emptyStateEl = document.getElementById("preview-empty-state");
  
  // ALWAYS display preview modal popup on top of all UI layers
  if (previewModal) {
    previewModal.style.display = "flex";
    previewModal.style.zIndex = "10000";
  }

  // Auto fallback to first imported asset if available
  if (!currentSelectedAsset && stateManager.assets.length > 0) {
    currentSelectedAsset = stateManager.assets[0];
    if (currentSelectedAsset) {
      highlightActiveAssetCard();
    }
  }

  if (!currentSelectedAsset) {
    if (loaderEl) loaderEl.style.display = "none";
    if (emptyStateEl) emptyStateEl.style.display = "flex";
    if (previewStatus) previewStatus.innerText = "Please import or select a video clip first.";
    return;
  }

  // Hide empty state if asset is selected & show loader overlay
  if (emptyStateEl) emptyStateEl.style.display = "none";
  if (loaderEl) loaderEl.style.display = "flex";
  if (previewStatus) previewStatus.innerText = "Rendering draft preview clip...";


  const spinnerEl = btnLivePreview?.querySelector(".btn-spinner") as HTMLElement | null;
  const iconEl = btnLivePreview?.querySelector(".btn-icon") as HTMLElement | null;
  const labelEl = btnLivePreview?.querySelector(".btn-label") as HTMLElement | null;

  // Set processing state on button
  if (btnLivePreview) {
    btnLivePreview.classList.add("btn-loading");
    if (spinnerEl) spinnerEl.style.display = "inline-block";
    if (iconEl) iconEl.style.display = "none";
    if (labelEl) labelEl.textContent = "Rendering...";
  }

  const startTime = Date.now();

  try {
    const config: AppConfig = {
      ...stateManager.project,
      input_path: currentSelectedAsset.path,
      input_paths: [currentSelectedAsset.path],
      imported_assets: stateManager.assets,
    };

    const path = await TauriService.generatePreviewClip(config);
    const webSrc = convertFileSrc(path);
    
    if (previewVideo) {
      previewVideo.src = webSrc;
      previewVideo.load();
      await previewVideo.play().catch((err) => {
        console.warn("Autoplay was prevented by browser policy:", err);
      });
    }

    if (loaderEl) loaderEl.style.display = "none";
    if (previewStatus) previewStatus.innerText = "Preview loaded successfully!";
  } catch (e: any) {
    console.error("[Live Preview Error]", e);
    const errMsg = typeof e === "object" ? (e.message || JSON.stringify(e)) : String(e);
    if (loaderEl) loaderEl.style.display = "none";
    if (previewStatus) previewStatus.innerText = `Preview failed: ${errMsg}`;
    
    // Render error card overlay inside the modal player
    if (emptyStateEl) {
      emptyStateEl.style.display = "flex";
      emptyStateEl.innerHTML = `
        <div style="font-size: 38px;">⚠️</div>
        <div style="font-size: 15px; font-weight: 600; color: var(--danger);">Preview Generation Failed</div>
        <div style="font-size: 12px; color: var(--text-secondary); max-width: 380px; word-break: break-word; line-height: 1.4;">${errMsg}</div>
        <button id="btn-preview-retry" class="toolbar-btn" style="background: var(--accent); color: white; padding: 6px 16px; margin-top: 6px;">
          ⟳ Retry Preview
        </button>
      `;
      const retryBtn = document.getElementById("btn-preview-retry");
      if (retryBtn) {
        retryBtn.addEventListener("click", () => generateAndShowPreview());
      }
    }
    showToast(`Preview failed: ${errMsg}`, "error");
  } finally {

    // Ensure smooth minimum loading transition time (350ms) to prevent 1ms harsh button flickering on cache hits
    const elapsed = Date.now() - startTime;
    if (elapsed < 350) {
      await new Promise((resolve) => setTimeout(resolve, 350 - elapsed));
    }

    // Restore button state safely without destroying DOM listeners
    if (btnLivePreview) {
      btnLivePreview.classList.remove("btn-loading");
      if (spinnerEl) spinnerEl.style.display = "none";
      if (iconEl) iconEl.style.display = "inline-block";
      if (labelEl) labelEl.textContent = "Live Preview";
    }
  }
}




function updateRenderStats() {
  const totalClips = stateManager.renderQueue.length;
  const completed = stateManager.renderQueue.filter(j => j.status === "Completed").length;
  const working = stateManager.renderQueue.filter(j => j.status === "Encoding" || j.status === "Preparing" || j.status === "Finalizing").length;
  const queued = stateManager.renderQueue.filter(j => j.status === "Queued").length;

  const totalEl = document.getElementById("stat-total-clips");
  const completedEl = document.getElementById("stat-completed-clips");
  const workingEl = document.getElementById("stat-working-clips");
  const queuedEl = document.getElementById("stat-queued-clips");

  if (totalEl) totalEl.innerText = totalClips.toString();
  if (completedEl) completedEl.innerText = completed.toString();
  if (workingEl) workingEl.innerText = working.toString();
  if (queuedEl) queuedEl.innerText = queued.toString();

  // Show/hide ZIP export button if completed jobs exist
  if (btnExportZip) {
    btnExportZip.style.display = completed > 0 ? "inline-flex" : "none";
  }

  // Calculate overall queue remaining ETA
  let totalEtaSeconds = 0;
  let hasEta = false;
  const activeJobs = stateManager.renderQueue.filter(j => j.status === "Encoding" || j.status === "Preparing" || j.status === "Finalizing");
  activeJobs.forEach(j => {
    if (j.eta_seconds !== null && j.eta_seconds !== undefined && j.eta_seconds > 0) {
      totalEtaSeconds += j.eta_seconds;
      hasEta = true;
    }
  });

  const completedJobsWithTime = stateManager.renderQueue.filter(j => j.status === "Completed" && j.elapsed_seconds > 0);
  if (completedJobsWithTime.length > 0 && queued > 0) {
    const avgSeconds = completedJobsWithTime.reduce((acc, curr) => acc + curr.elapsed_seconds, 0) / completedJobsWithTime.length;
    totalEtaSeconds += avgSeconds * queued;
    hasEta = true;
  }

  if (queueEtaBanner) {
    queueEtaBanner.innerText = hasEta ? `⏳ Queue: ${formatEtaHuman(totalEtaSeconds)}` : "";
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
  bar.style.position = "relative"; // for absolute text

  const fill = document.createElement("div");
  fill.className = "queue-progress-fill";
  fill.style.width = `${job.progress}%`;

  const percentText = document.createElement("span");
  percentText.className = "queue-progress-text";
  percentText.innerText = `${job.progress.toFixed(1)}%`;

  bar.appendChild(fill);
  bar.appendChild(percentText);

  colInfo.appendChild(title);
  colInfo.appendChild(bar);

  const colStats = document.createElement("div");
  colStats.className = "queue-col";
  colStats.style.width = "180px";

  const speed = document.createElement("div");
  speed.className = "queue-meta";
  
  const status = document.createElement("div");
  status.style.marginTop = "6px";
  const badge = document.createElement("span");
  
  let badgeClass = "queued";
  if (job.status === "Encoding" || job.status === "Finalizing") {
    badgeClass = "encoding";
  } else if (job.status === "Completed") {
    badgeClass = "completed";
  } else if (job.status === "Cancelled") {
    badgeClass = "cancelled";
  } else if (job.status === "Failed") {
    badgeClass = "failed";
  }
  badge.className = `status-badge ${badgeClass}`;
  badge.innerText = job.status;
  status.appendChild(badge);

  if (job.status === "Completed") {
    speed.innerText = "Finished successfully";
  } else if (job.status === "Failed") {
    speed.innerText = job.error_message ? `Error: ${job.error_message}` : "Failed";
  } else if (job.status === "Cancelled") {
    speed.innerText = "Cancelled by user";
  } else if (job.speed) {
    const etaStr = job.eta_seconds !== null ? formatEtaHuman(job.eta_seconds) : "";
    speed.innerText = `Speed: ${job.speed}${etaStr ? ` | ${etaStr}` : ""}`;
  } else {
    speed.innerText = "Speed: -- | ETA: --";
  }

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

  if (job.status === "Completed" || job.status === "Cancelled" || job.status === "Failed") {
    cancelBtn.style.display = "none";
  }

  colActions.appendChild(cancelBtn);

  row.appendChild(colInfo);
  row.appendChild(colStats);
  row.appendChild(colActions);

  jobsListContainer.appendChild(row);
  activeJobUis.set(job.id, row);

  // Sync to stateManager.renderQueue
  const existingIdx = stateManager.renderQueue.findIndex(j => j.id === job.id);
  if (existingIdx >= 0) {
    stateManager.renderQueue[existingIdx] = job;
  } else {
    stateManager.renderQueue.push(job);
  }
  updateRenderStats();
}

function setupTauriEventListeners() {
  TauriService.onJobStarted((id) => {
    const row = activeJobUis.get(id);
    if (row) {
      const badge = row.querySelector(".status-badge") as HTMLSpanElement;
      badge.className = "status-badge encoding";
      badge.innerText = "Encoding";
    }
    const job = stateManager.renderQueue.find(j => j.id === id);
    if (job) {
      job.status = "Encoding";
    }
    updateRenderStats();
  });

  TauriService.onJobProgress((id, progress, speed, _elapsed, eta) => {
    const row = activeJobUis.get(id);
    if (row) {
      const fill = row.querySelector(".queue-progress-fill") as HTMLDivElement;
      fill.style.width = `${progress}%`;
      const txt = row.querySelector(".queue-progress-text") as HTMLSpanElement;
      if (txt) txt.innerText = `${progress.toFixed(1)}%`;

      const stats = row.querySelector(".queue-meta") as HTMLDivElement;
      const etaStr = eta !== null ? formatEtaHuman(eta) : "";
      stats.innerText = `Speed: ${speed}${etaStr ? ` | ${etaStr}` : ""}`;
    }
    const job = stateManager.renderQueue.find(j => j.id === id);
    if (job) {
      job.progress = progress;
      job.speed = speed;
      job.eta_seconds = eta;
      job.status = "Encoding";
    }
    updateRenderStats();
  });


  TauriService.onJobCompleted((id) => {
    const row = activeJobUis.get(id);
    if (row) {
      const fill = row.querySelector(".queue-progress-fill") as HTMLDivElement;
      fill.style.width = "100%";
      const txt = row.querySelector(".queue-progress-text") as HTMLSpanElement;
      if (txt) txt.innerText = `100.0%`;

      const badge = row.querySelector(".status-badge") as HTMLSpanElement;
      badge.className = "status-badge completed";
      badge.innerText = "Completed";

      const stats = row.querySelector(".queue-meta") as HTMLDivElement;
      stats.innerText = "Finished successfully";

      const cancelBtn = row.querySelector("button") as HTMLButtonElement;
      if (cancelBtn) cancelBtn.style.display = "none";
      
      showToast("Clip render complete!", "success");
    }
    const job = stateManager.renderQueue.find(j => j.id === id);
    if (job) {
      job.status = "Completed";
      job.progress = 100;
    }
    updateRenderStats();
  });

  TauriService.onJobFailed((id, error) => {
    const row = activeJobUis.get(id);
    if (row) {
      const fill = row.querySelector(".queue-progress-fill") as HTMLDivElement;
      fill.style.background = "var(--danger)"; // visual indicator for failed job bar

      const badge = row.querySelector(".status-badge") as HTMLSpanElement;
      badge.className = "status-badge failed";
      badge.innerText = "Failed";

      const stats = row.querySelector(".queue-meta") as HTMLDivElement;
      stats.innerText = `Error: ${error.length > 50 ? error.substring(0, 47) + '...' : error}`;

      const cancelBtn = row.querySelector("button") as HTMLButtonElement;
      if (cancelBtn) cancelBtn.style.display = "none";
      
      showToast("Clip render failed!", "error");
    }
    const job = stateManager.renderQueue.find(j => j.id === id);
    if (job) {
      job.status = "Failed";
      job.error_message = error;
    }
    updateRenderStats();
  });

  TauriService.onJobCancelled((id) => {
    const row = activeJobUis.get(id);
    if (row) {
      const badge = row.querySelector(".status-badge") as HTMLSpanElement;
      badge.className = "status-badge cancelled";
      badge.innerText = "Cancelled";

      const stats = row.querySelector(".queue-meta") as HTMLDivElement;
      stats.innerText = "Cancelled by user";

      const cancelBtn = row.querySelector("button") as HTMLButtonElement;
      if (cancelBtn) cancelBtn.style.display = "none";
    }
    const job = stateManager.renderQueue.find(j => j.id === id);
    if (job) {
      job.status = "Cancelled";
    }
    updateRenderStats();
  });

  TauriService.onJobsCancelledAll(() => {
    stateManager.renderQueue.forEach(job => {
      if (job.status === "Queued" || job.status === "Preparing" || job.status === "Encoding") {
        job.status = "Cancelled";
        const row = activeJobUis.get(job.id);
        if (row) {
          const badge = row.querySelector(".status-badge") as HTMLSpanElement;
          badge.className = "status-badge cancelled";
          badge.innerText = "Cancelled";

          const stats = row.querySelector(".queue-meta") as HTMLDivElement;
          stats.innerText = "Cancelled by user";

          const cancelBtn = row.querySelector("button") as HTMLButtonElement;
          cancelBtn.disabled = true;
          cancelBtn.innerText = "Cancelled";
        }
      }
    });
    updateRenderStats();
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


export function toggleLeftPanel(show?: boolean) {
  isLeftPanelVisible = show !== undefined ? show : !isLeftPanelVisible;
  const leftPanel = document.querySelector("#left-panel") as HTMLDivElement | null;
  const leftResizer = document.querySelector("#left-resizer") as HTMLDivElement | null;
  if (leftPanel) leftPanel.style.display = isLeftPanelVisible ? "flex" : "none";
  if (leftResizer) leftResizer.style.display = isLeftPanelVisible ? "block" : "none";
  if (btnToggleLeft) {
    btnToggleLeft.classList.toggle("active", isLeftPanelVisible);
  }
  showToast(isLeftPanelVisible ? "Left Sidebar shown" : "Left Sidebar hidden", "success");
  refreshViewport();
}

export function toggleBottomPanel(show?: boolean) {
  isBottomPanelVisible = show !== undefined ? show : !isBottomPanelVisible;
  const bottomPanel = document.querySelector("#bottom-panel") as HTMLDivElement | null;
  const bottomResizer = document.querySelector("#bottom-resizer") as HTMLDivElement | null;
  if (bottomPanel) bottomPanel.style.display = isBottomPanelVisible ? "flex" : "none";
  if (bottomResizer) bottomResizer.style.display = isBottomPanelVisible ? "block" : "none";
  if (btnToggleBottom) {
    btnToggleBottom.classList.toggle("active", isBottomPanelVisible);
  }
  showToast(isBottomPanelVisible ? "Bottom Timeline shown" : "Bottom Timeline hidden", "success");
  refreshViewport();
}

(window as any).toggleLeftPanel = toggleLeftPanel;
(window as any).toggleBottomPanel = toggleBottomPanel;

function setupCustomThemeDropdown() {
  const trigger = document.getElementById("theme-dropdown-trigger");
  const menu = document.getElementById("theme-dropdown-menu");
  const label = document.getElementById("theme-dropdown-label");
  const items = document.querySelectorAll("#theme-dropdown-menu .dropdown-item");

  if (!trigger || !menu || !label) return;

  let activeConfirmedTheme = selectTheme.value || "dark-obsidian";

  const syncDropdownUI = (val: string) => {
    activeConfirmedTheme = val;
    items.forEach((item) => {
      const itemVal = item.getAttribute("data-value");
      const itemName = item.getAttribute("data-name");
      if (itemVal === val) {
        item.classList.add("active");
        label.textContent = itemName || "Obsidian";
      } else {
        item.classList.remove("active");
      }
    });
  };

  syncDropdownUI(selectTheme.value);

  // Toggle menu on trigger click
  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    const isVisible = menu.style.display === "flex";
    menu.style.display = isVisible ? "none" : "flex";
  });

  // Live Theme Preview on Hover
  items.forEach((item) => {
    item.addEventListener("mouseenter", () => {
      const hoveredVal = item.getAttribute("data-value");
      if (hoveredVal) {
        document.body.className = `theme-${hoveredVal}`;
      }
    });

    item.addEventListener("click", (e) => {
      e.stopPropagation();
      const val = item.getAttribute("data-value");
      if (val) {
        selectTheme.value = val;
        selectTheme.dispatchEvent(new Event("change"));
        syncDropdownUI(val);
      }
      menu.style.display = "none";
    });
  });

  // Revert preview on mouse leave if not selected
  menu.addEventListener("mouseleave", () => {
    document.body.className = `theme-${activeConfirmedTheme}`;
  });

  selectTheme.addEventListener("change", () => {
    syncDropdownUI(selectTheme.value);
  });

  window.addEventListener("click", () => {
    if (menu.style.display === "flex") {
      document.body.className = `theme-${activeConfirmedTheme}`;
      menu.style.display = "none";
    }
  });
}



function setupCommandPalette() {
  paletteSearch.addEventListener("input", () => {
    const q = paletteSearch.value.toLowerCase();
    paletteResults.innerHTML = "";

    const commands = [
      { name: "View: Toggle Left Sidebar / Panel (Ctrl+B)", action: toggleLeftPanel },
      { name: "View: Toggle Bottom Timeline / Queue (Ctrl+J)", action: toggleBottomPanel },
      { name: "Command: New Project File", action: triggerNewProject },
      { name: "Command: Open Project File (Import)", action: triggerOpenProject },
      { name: "Command: Save Project File (Export)", action: triggerSaveProject },
      { name: "Command: Undo Last Change (Ctrl+Z)", action: () => stateManager.history.undo() },
      { name: "Command: Redo Undone Change (Ctrl+Y)", action: () => stateManager.history.redo() },
      { name: "Command: Import Video File", action: triggerImport },
      { name: "Command: Clear Cache Directory", action: clearCacheDir },
      { name: "Command: Preview Draft Clip (▶)", action: generateAndShowPreview },
      { name: "Command: Batch Export Queue", action: startBatchExport },
      { name: "Command: Export All Clips as ZIP Package (📦)", action: () => {
          if (btnExportZip) btnExportZip.click();
      }},
      { name: "Command: Switch to Clips Timeline", action: () => switchBottomTab("clips") },
      { name: "Command: Switch to Render Queue", action: () => switchBottomTab("render") },
      { name: "Command: Add Extra Text Overlay", action: () => {
          if (btnAddExtra) btnAddExtra.click();
      }},
      { name: "Command: Add Media Overlay (Watermark / Sticker)", action: () => {
          if (btnAddMedia) btnAddMedia.click();
      }},
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
      { name: "Theme: Apply Midnight Tokyo 🌆", action: () => {
          selectTheme.value = "midnight-tokyo";
          selectTheme.dispatchEvent(new Event("change"));
      }},
      { name: "Theme: Apply Sunset Crimson 🌅", action: () => {
          selectTheme.value = "sunset-crimson";
          selectTheme.dispatchEvent(new Event("change"));
      }},
      { name: "Theme: Apply Emerald Mint 🍃", action: () => {
          selectTheme.value = "emerald-mint";
          selectTheme.dispatchEvent(new Event("change"));
      }},
      { name: "Theme: Apply Nordic Frost ❄️", action: () => {
          selectTheme.value = "nordic-frost";
          selectTheme.dispatchEvent(new Event("change"));
      }},
      { name: "Theme: Apply Royal Amethyst 🔮", action: () => {
          selectTheme.value = "royal-amethyst";
          selectTheme.dispatchEvent(new Event("change"));
      }},
      { name: "Theme: Apply Forest Slate 🌲", action: () => {
          selectTheme.value = "forest-slate";
          selectTheme.dispatchEvent(new Event("change"));
      }},
      { name: "Theme: Apply Monochrome Minimalist ♠️", action: () => {
          selectTheme.value = "monochrome-pure";
          selectTheme.dispatchEvent(new Event("change"));
      }},
      { name: "Theme: Apply Light Glassmorphism ☀️", action: () => {
          selectTheme.value = "light-glassmorphism";
          selectTheme.dispatchEvent(new Event("change"));
      }},

      { name: "Layout: Fit Vertical Crop (9:16 Shorts / TikTok)", action: () => {
          propAspectRatio.value = "9:16";
          propAspectRatio.dispatchEvent(new Event("change"));
          showToast("Layout set to 9:16 Vertical Shorts", "success");
      }},
      { name: "Layout: Fit Horizontal Crop (16:9 Youtube Landscape)", action: () => {
          propAspectRatio.value = "16:9";
          propAspectRatio.dispatchEvent(new Event("change"));
          showToast("Layout set to 16:9 Landscape", "success");
      }},
      { name: "Layout: Fit Square Crop (1:1 Post)", action: () => {
          propAspectRatio.value = "1:1";
          propAspectRatio.dispatchEvent(new Event("change"));
          showToast("Layout set to 1:1 Square", "success");
      }},
      { name: "Layout: Fit Portrait Crop (4:5 Post)", action: () => {
          propAspectRatio.value = "4:5";
          propAspectRatio.dispatchEvent(new Event("change"));
          showToast("Layout set to 4:5 Portrait", "success");
      }},
      { name: "Layout: Fit Original Aspect Ratio", action: () => {
          propAspectRatio.value = "original";
          propAspectRatio.dispatchEvent(new Event("change"));
          showToast("Layout set to original aspect ratio", "success");
      }},
      { name: "Crop Anchor: Center", action: () => {
          propCropAnchor.value = "Center";
          propCropAnchor.dispatchEvent(new Event("change"));
      }},
      { name: "Crop Anchor: Top", action: () => {
          propCropAnchor.value = "Top";
          propCropAnchor.dispatchEvent(new Event("change"));
      }},
      { name: "Crop Anchor: Bottom", action: () => {
          propCropAnchor.value = "Bottom";
          propCropAnchor.dispatchEvent(new Event("change"));
      }},
      { name: "Background: Solid Color", action: () => {
          propBgMode.value = "solid";
          propBgMode.dispatchEvent(new Event("change"));
      }},
      { name: "Background: Blurred Video Background", action: () => {
          propBgMode.value = "blur";
          propBgMode.dispatchEvent(new Event("change"));
      }},
      { name: "Command: Show Keyboard Shortcuts Help", action: () => showToast("Hotkeys: Ctrl+Z (Undo), Ctrl+Y (Redo), Ctrl+B (Sidebar), Ctrl+J (Timeline), Ctrl+K (Palette), Esc (Close)", "warning") }
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
      const newWidth = Math.max(350, Math.min(600, startWidth - (moveEvent.clientX - startX)));
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
    resetProjectSession();
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
      
      resetProjectSession();
      stateManager.project.aspect_ratio = ratio;
      stateManager.project.output_resolution = res;
      
      if (res.startsWith("1080x1920")) {
        stateManager.project.output_width = 1080;
        stateManager.project.output_height = 1920;
      } else if (res.startsWith("1920x1080")) {
        stateManager.project.output_width = 1920;
        stateManager.project.output_height = 1080;
      }
      
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
  // Pause the main canvas preview video if it is currently playing
  const mainVideo = canvasRenderer.getVideoElement();
  if (mainVideo && !mainVideo.paused) {
    mainVideo.pause();
  }

  trimModalFilename.textContent = asset.name;
  trimLoadingOverlay.style.display = "flex";
  trimModalVideo.src = convertFileSrc(asset.path);
  trimModalVideo.load();

  // Custom playback controllers state
  let isScrubbing = false;

  // Reset custom controls visual states
  trimModalVideo.muted = false;
  trimModalVideo.volume = savedVolume / 100;
  trimPlayIcon.innerHTML = '<path d="M8 5v14l11-7z"/>';
  trimVideoProgress.value = "0";
  trimVideoProgress.style.background = `rgba(255, 255, 255, 0.15)`;

  let duration = 0;

  const updateProgressFill = () => {
    const val = parseFloat(trimVideoProgress.value) || 0;
    const max = parseFloat(trimVideoProgress.max) || 100;
    const pct = max > 0 ? (val / max) * 100 : 0;
    trimVideoProgress.style.background = `linear-gradient(to right, var(--accent) 0%, var(--accent) ${pct}%, rgba(255, 255, 255, 0.15) ${pct}%, rgba(255, 255, 255, 0.15) 100%)`;
  };

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
    trimTimeCurrent.textContent = formatDuration(trimModalVideo.currentTime);
    
    // Custom controls slider initialization
    trimVideoProgress.max = duration.toString();
    trimVideoProgress.value = isTrimmed ? trim.start.toString() : "0";
    trimVideoTimeDisplay.textContent = `${formatDuration(trimModalVideo.currentTime)} / ${formatDuration(duration)}`;
    
    updateProgressFill();
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

    // Display active trim bounds on the timeline labels
    trimTimeCurrent.textContent = formatDuration(start);
    trimTimeDuration.textContent = formatDuration(end);

    // Toggle save button state based on simple range validation
    if (start >= end || start < 0 || end > duration + 0.1) {
      btnTrimSave.disabled = true;
    } else {
      btnTrimSave.disabled = false;
    }
  };

  const onTimeUpdate = () => {
    // Sync custom progress bar slider
    if (!isScrubbing) {
      trimVideoProgress.value = trimModalVideo.currentTime.toString();
    }
    
    updateProgressFill();

    // Sync custom controls timer label
    const currentStr = formatDuration(trimModalVideo.currentTime);
    const totalStr = formatDuration(duration);
    trimVideoTimeDisplay.textContent = `${currentStr} / ${totalStr}`;
  };

  // Custom Controls Action Callbacks
  const onPlayToggle = () => {
    if (trimModalVideo.paused) {
      trimModalVideo.play().catch(e => console.error("Play failed:", e));
    } else {
      trimModalVideo.pause();
    }
  };

  const onVideoPlay = () => {
    trimPlayIcon.innerHTML = '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>'; // Pause icon
  };

  const onVideoPause = () => {
    trimPlayIcon.innerHTML = '<path d="M8 5v14l11-7z"/>'; // Play icon
  };

  const onProgressInput = () => {
    isScrubbing = true;
    const target = parseFloat(trimVideoProgress.value) || 0;
    trimModalVideo.currentTime = target;
    updateProgressFill();
  };

  const onProgressChange = () => {
    isScrubbing = false;
  };

  const updateVolumeUI = (volPct: number, isMuted: boolean) => {
    trimVolumeText.textContent = `${volPct}%`;
    trimVolumeSlider.value = volPct.toString();
    
    if (isMuted || volPct === 0) {
      trimVolumeIcon.innerHTML = '<path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.21.05-.42.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>'; // Mute icon
    } else if (volPct <= 50) {
      trimVolumeIcon.innerHTML = '<path d="M18.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z"/>'; // Low volume icon (1 wave)
    } else {
      trimVolumeIcon.innerHTML = '<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>'; // High volume icon (2 waves)
    }
  };

  const onVolumeSliderInput = () => {
    const volPct = parseInt(trimVolumeSlider.value) || 0;
    trimModalVideo.volume = volPct / 100;
    
    if (volPct > 0) {
      trimModalVideo.muted = false;
      savedVolume = volPct;
    } else {
      trimModalVideo.muted = true;
    }
    
    updateVolumeUI(volPct, trimModalVideo.muted);
  };

  const onVolumeToggle = () => {
    trimModalVideo.muted = !trimModalVideo.muted;
    if (trimModalVideo.muted) {
      updateVolumeUI(0, true);
    } else {
      if (savedVolume === 0) savedVolume = 100;
      trimModalVideo.volume = savedVolume / 100;
      updateVolumeUI(savedVolume, false);
    }
  };

  // Drag system state & event handlers
  let isDraggingLeft = false;
  let isDraggingRight = false;
  let isDraggingRange = false;
  let dragStartX = 0;
  let initialStartVal = 0;
  let initialEndVal = 0;

  const getSecondsFromX = (clientX: number): number => {
    const rect = trimTimelineTrack.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return pct * duration;
  };

  const onMouseDownLeft = (e: MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    isDraggingLeft = true;
    dragStartX = e.clientX;
    initialStartVal = parseFloat(trimStartInput.value) || 0;
    
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const onMouseDownRight = (e: MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    isDraggingRight = true;
    dragStartX = e.clientX;
    initialEndVal = parseFloat(trimEndInput.value) || duration;

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const onMouseDownRange = (e: MouseEvent) => {
    if (e.target === trimHandleLeft || e.target === trimHandleRight) return;
    
    e.stopPropagation();
    e.preventDefault();
    isDraggingRange = true;
    dragStartX = e.clientX;
    initialStartVal = parseFloat(trimStartInput.value) || 0;
    initialEndVal = parseFloat(trimEndInput.value) || duration;

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const enableTrimCheckbox = () => {
    if (!trimEnabledCheckbox.checked) {
      trimEnabledCheckbox.checked = true;
    }
  };

  const onMouseMove = (e: MouseEvent) => {
    if (duration <= 0) return;
    const deltaX = e.clientX - dragStartX;
    const rect = trimTimelineTrack.getBoundingClientRect();
    const deltaSecs = (deltaX / rect.width) * duration;

    if (isDraggingLeft || isDraggingRight || isDraggingRange) {
      enableTrimCheckbox();
    }

    if (isDraggingLeft) {
      let newStart = initialStartVal + deltaSecs;
      const currentEnd = parseFloat(trimEndInput.value) || duration;
      if (newStart < 0) newStart = 0;
      if (newStart > currentEnd - 0.1) newStart = currentEnd - 0.1;
      
      trimStartInput.value = newStart.toFixed(2);
      updateRangeTrack();
      
      trimModalVideo.currentTime = newStart;
    } else if (isDraggingRight) {
      let newEnd = initialEndVal + deltaSecs;
      const currentStart = parseFloat(trimStartInput.value) || 0;
      if (newEnd > duration) newEnd = duration;
      if (newEnd < currentStart + 0.1) newEnd = currentStart + 0.1;

      trimEndInput.value = newEnd.toFixed(2);
      updateRangeTrack();

      trimModalVideo.currentTime = newEnd;
    } else if (isDraggingRange) {
      let newStart = initialStartVal + deltaSecs;
      let newEnd = initialEndVal + deltaSecs;
      const selectDuration = initialEndVal - initialStartVal;

      if (newStart < 0) {
        newStart = 0;
        newEnd = selectDuration;
      }
      if (newEnd > duration) {
        newEnd = duration;
        newStart = duration - selectDuration;
      }

      trimStartInput.value = newStart.toFixed(2);
      trimEndInput.value = newEnd.toFixed(2);
      updateRangeTrack();
      
      // Keep player synced with start of the shifted block
      trimModalVideo.currentTime = newStart;
    }
  };

  const onMouseUp = () => {
    isDraggingLeft = false;
    isDraggingRight = false;
    isDraggingRange = false;
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", onMouseUp);
  };

  const onTrackClick = (e: MouseEvent) => {
    if (e.target === trimHandleLeft || e.target === trimHandleRight || e.target === trimTimelineRange) return;
    const clickedSecs = getSecondsFromX(e.clientX);
    trimModalVideo.currentTime = clickedSecs;
  };

  // Bind Listeners
  trimModalVideo.addEventListener("loadedmetadata", onLoadedMetadata);
  trimModalVideo.addEventListener("timeupdate", onTimeUpdate);
  trimModalVideo.addEventListener("play", onVideoPlay);
  trimModalVideo.addEventListener("pause", onVideoPause);
  trimVideoPlayBtn.addEventListener("click", onPlayToggle);
  trimVideoProgress.addEventListener("input", onProgressInput);
  trimVideoProgress.addEventListener("change", onProgressChange);
  trimVideoVolumeBtn.addEventListener("click", onVolumeToggle);
  trimVolumeSlider.addEventListener("input", onVolumeSliderInput);

  // Initialize initial Volume UI
  updateVolumeUI(savedVolume, trimModalVideo.muted);

  const startInputHandler = () => {
    let val = parseFloat(trimStartInput.value) || 0;
    if (val < 0) val = 0;
    trimStartInput.value = val.toFixed(2);
    enableTrimCheckbox();
    updateRangeTrack();
  };

  const endInputHandler = () => {
    let val = parseFloat(trimEndInput.value) || duration;
    if (val > duration) val = duration;
    trimEndInput.value = val.toFixed(2);
    enableTrimCheckbox();
    updateRangeTrack();
  };

  trimStartInput.addEventListener("change", startInputHandler);
  trimEndInput.addEventListener("change", endInputHandler);

  const onSetStartClick = () => {
    const cur = parseFloat(trimModalVideo.currentTime.toFixed(2));
    trimStartInput.value = cur.toString();
    enableTrimCheckbox();
    updateRangeTrack();
  };

  const onSetEndClick = () => {
    const cur = parseFloat(trimModalVideo.currentTime.toFixed(2));
    trimEndInput.value = cur.toString();
    enableTrimCheckbox();
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

  trimHandleLeft.addEventListener("mousedown", onMouseDownLeft);
  trimHandleRight.addEventListener("mousedown", onMouseDownRight);
  trimTimelineRange.addEventListener("mousedown", onMouseDownRange);
  trimTimelineTrack.addEventListener("click", onTrackClick);

  const closeTrimModal = () => {
    trimModal.style.display = "none";
    trimModalVideo.pause();
    trimModalVideo.src = "";

    // Cleanup listeners
    trimModalVideo.removeEventListener("loadedmetadata", onLoadedMetadata);
    trimModalVideo.removeEventListener("timeupdate", onTimeUpdate);
    trimModalVideo.removeEventListener("play", onVideoPlay);
    trimModalVideo.removeEventListener("pause", onVideoPause);
    trimVideoPlayBtn.removeEventListener("click", onPlayToggle);
    trimVideoProgress.removeEventListener("input", onProgressInput);
    trimVideoProgress.removeEventListener("change", onProgressChange);
    trimVideoVolumeBtn.removeEventListener("click", onVolumeToggle);
    trimVolumeSlider.removeEventListener("input", onVolumeSliderInput);

    trimStartInput.removeEventListener("change", startInputHandler);
    trimEndInput.removeEventListener("change", endInputHandler);
    btnSetTrimStart.removeEventListener("click", onSetStartClick);
    btnSetTrimEnd.removeEventListener("click", onSetEndClick);
    btnTrimReset.removeEventListener("click", onResetClick);
    btnTrimCancel.removeEventListener("click", onCancelClick);
    btnTrimSave.removeEventListener("click", onSaveClick);
    
    trimHandleLeft.removeEventListener("mousedown", onMouseDownLeft);
    trimHandleRight.removeEventListener("mousedown", onMouseDownRight);
    trimTimelineRange.removeEventListener("mousedown", onMouseDownRange);
    trimTimelineTrack.removeEventListener("click", onTrackClick);
    
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", onMouseUp);
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
    highlightActiveAssetCard();

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

function openMediaSettingsModal(idx: number) {
  try {
    const overlays = stateManager.project.media_overlays || [];
    const overlay = overlays[idx];
    if (!overlay) {
      showToast("Media overlay not found!", "error");
      return;
    }

    const overlayPath = overlay.path || "";
    mediaModalFilename.innerText = overlayPath.split(/[/\\]/).pop() || overlay.name;
    propMediaType.value = overlay.type || "video";
    propMediaLoop.value = overlay.loop_mode || "repeat";
    propMediaChroma.checked = overlay.chroma_key || false;
    propMediaChromaColor.value = overlay.chroma_color || "#00ff00";
    mediaModalChromaColorBtn.style.backgroundColor = propMediaChromaColor.value;
    mediaModalChromaColorHex.value = propMediaChromaColor.value;
    propMediaSimilarity.value = (overlay.chroma_similarity || 0.3).toString();
    propMediaBlend.value = (overlay.chroma_blend || 0.05).toString();

    const simValSpan = document.getElementById("media-modal-similarity-val")!;
    const blendValSpan = document.getElementById("media-modal-blend-val")!;
    simValSpan.innerText = parseFloat(propMediaSimilarity.value).toFixed(2);
    blendValSpan.innerText = parseFloat(propMediaBlend.value).toFixed(2);

    // Setup live-preview canvases
    const mainCanvas = document.getElementById("media-modal-canvas") as HTMLCanvasElement;
    const mainCtx = mainCanvas.getContext("2d")!;
    const tempCanvas = document.createElement("canvas");
    const tempCtx = tempCanvas.getContext("2d")!;

    let animId = 0;
    let chromaEnabled = propMediaChroma.checked;
    let targetColor = propMediaChromaColor.value;
    let similarity = parseFloat(propMediaSimilarity.value);
    let blend = parseFloat(propMediaBlend.value);

    const hexToRgb = (hex: string) => {
      const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
      const fullHex = hex.replace(shorthandRegex, (_, r, g, b) => r + r + g + g + b + b);
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(fullHex);
      return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
      } : { r: 0, g: 255, b: 0 };
    };

    const rgbToYuv = (r: number, g: number, b: number) => {
      return {
        u: -0.169 * r - 0.331 * g + 0.5 * b + 128,
        v: 0.5 * r - 0.419 * g - 0.081 * b + 128
      };
    };

    let targetRgb = hexToRgb(targetColor);
    let targetYuv = rgbToYuv(targetRgb.r, targetRgb.g, targetRgb.b);

    const updateColorConfig = (hex: string) => {
      targetColor = hex;
      targetRgb = hexToRgb(targetColor);
      targetYuv = rgbToYuv(targetRgb.r, targetRgb.g, targetRgb.b);
      if (!isVideo) {
        drawFrame();
      }
    };

    let videoEl: HTMLVideoElement | null = null;
    let imgEl: HTMLImageElement | null = null;
    let isVideo = (overlay.type === "video");

    const drawFrame = () => {
      let sourceWidth = 0;
      let sourceHeight = 0;

      if (isVideo && videoEl) {
        sourceWidth = videoEl.videoWidth;
        sourceHeight = videoEl.videoHeight;
      } else if (!isVideo && imgEl) {
        sourceWidth = imgEl.naturalWidth;
        sourceHeight = imgEl.naturalHeight;
      }

      if (sourceWidth === 0 || sourceHeight === 0) {
        if (isVideo) animId = requestAnimationFrame(drawFrame);
        return;
      }

      if (tempCanvas.width !== sourceWidth || tempCanvas.height !== sourceHeight) {
        tempCanvas.width = sourceWidth;
        tempCanvas.height = sourceHeight;
        mainCanvas.width = sourceWidth;
        mainCanvas.height = sourceHeight;
      }

      if (isVideo && videoEl) {
        tempCtx.drawImage(videoEl, 0, 0);
      } else if (!isVideo && imgEl) {
        tempCtx.drawImage(imgEl, 0, 0);
      }

      const imgData = tempCtx.getImageData(0, 0, sourceWidth, sourceHeight);
      const data = imgData.data;

      if (chromaEnabled) {
        const tU = targetYuv.u;
        const tV = targetYuv.v;

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i+1];
          const b = data[i+2];

          const u = -0.169 * r - 0.331 * g + 0.5 * b + 128;
          const v = 0.5 * r - 0.419 * g - 0.081 * b + 128;

          const uDiff = u - tU;
          const vDiff = v - tV;
          const dist = Math.sqrt(uDiff * uDiff + vDiff * vDiff) / 240.0;

          if (dist < similarity) {
            if (blend > 0 && (similarity - dist) < blend) {
              const alphaFactor = (similarity - dist) / blend;
              data[i + 3] = Math.round(alphaFactor * 255);
            } else {
              data[i + 3] = 0;
            }
          }
        }
      }

      mainCtx.putImageData(imgData, 0, 0);

      if (isVideo) {
        animId = requestAnimationFrame(drawFrame);
      }
    };

    // Load resources and start playing
    if (isVideo) {
      videoEl = document.createElement("video");
      videoEl.crossOrigin = "anonymous";
      videoEl.src = convertFileSrc(overlayPath);
      videoEl.loop = true;
      videoEl.muted = true;
      videoEl.playsInline = true;
      videoEl.style.display = "none";
      document.body.appendChild(videoEl);
      
      // Explicitly call load for Tauri webview context
      videoEl.load();

      const startLoop = () => {
        if (animId) cancelAnimationFrame(animId);
        animId = requestAnimationFrame(drawFrame);
      };

      videoEl.addEventListener("play", startLoop);
      videoEl.addEventListener("loadeddata", () => {
        videoEl!.play().catch((err) => console.warn("Video play failed:", err));
      });
      
      videoEl.play().catch(() => {
        // In case autoplay is delayed, kickstart loop
        startLoop();
      });
    } else {
      imgEl = document.createElement("img");
      imgEl.crossOrigin = "anonymous";
      imgEl.src = convertFileSrc(overlayPath);
      imgEl.addEventListener("load", () => {
        drawFrame();
      });
    }

    // Handle color picking directly from clicking on canvas
    const onCanvasClick = (e: MouseEvent) => {
      if (tempCanvas.width === 0 || tempCanvas.height === 0) return;
      const rect = mainCanvas.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * tempCanvas.width;
      const y = ((e.clientY - rect.top) / rect.height) * tempCanvas.height;

      try {
        const pixel = tempCtx.getImageData(Math.floor(x), Math.floor(y), 1, 1).data;
        const r = pixel[0];
        const g = pixel[1];
        const b = pixel[2];

        const componentToHex = (c: number) => {
          const hex = c.toString(16);
          return hex.length === 1 ? "0" + hex : hex;
        };
        const hexColor = "#" + componentToHex(r) + componentToHex(g) + componentToHex(b);

        propMediaChromaColor.value = hexColor;
        mediaModalChromaColorHex.value = hexColor;
        mediaModalChromaColorBtn.style.backgroundColor = hexColor;
        updateColorConfig(hexColor);
      } catch (err) {
        console.warn("Chroma color picking failed:", err);
      }
    };
    mainCanvas.addEventListener("click", onCanvasClick);

    const updateChromaSettingsState = () => {
      chromaEnabled = propMediaChroma.checked;
      const settingsDiv = document.getElementById("media-modal-chroma-settings")!;
      if (chromaEnabled) {
        settingsDiv.style.opacity = "1";
        settingsDiv.style.pointerEvents = "auto";
      } else {
        settingsDiv.style.opacity = "0.5";
        settingsDiv.style.pointerEvents = "none";
      }
      if (!isVideo) {
        drawFrame();
      }
    };
    updateChromaSettingsState();

    const onChromaChange = () => {
      updateChromaSettingsState();
    };
    propMediaChroma.addEventListener("change", onChromaChange);

    const onColorBtnClick = () => {
      propMediaChromaColor.click();
    };
    mediaModalChromaColorBtn.addEventListener("click", onColorBtnClick);

    const onColorInputChange = () => {
      const hex = propMediaChromaColor.value;
      mediaModalChromaColorHex.value = hex;
      mediaModalChromaColorBtn.style.backgroundColor = hex;
      updateColorConfig(hex);
    };
    propMediaChromaColor.addEventListener("input", onColorInputChange);

    const onHexTextInputChange = () => {
      let hex = mediaModalChromaColorHex.value.trim();
      if (!hex.startsWith("#")) hex = "#" + hex;
      if (/^#[0-9A-F]{6}$/i.test(hex)) {
        propMediaChromaColor.value = hex;
        mediaModalChromaColorBtn.style.backgroundColor = hex;
        updateColorConfig(hex);
      }
    };
    mediaModalChromaColorHex.addEventListener("input", onHexTextInputChange);

    const onSimilarityChange = () => {
      similarity = parseFloat(propMediaSimilarity.value);
      simValSpan.innerText = similarity.toFixed(2);
      if (!isVideo) {
        drawFrame();
      }
    };
    propMediaSimilarity.addEventListener("input", onSimilarityChange);

    const onBlendChange = () => {
      blend = parseFloat(propMediaBlend.value);
      blendValSpan.innerText = blend.toFixed(2);
      if (!isVideo) {
        drawFrame();
      }
    };
    propMediaBlend.addEventListener("input", onBlendChange);

    mediaSettingsModal.style.display = "flex";

    const cleanup = () => {
      mediaSettingsModal.style.display = "none";
      if (videoEl) {
        videoEl.pause();
        videoEl.src = "";
        if (videoEl.parentNode) {
          videoEl.parentNode.removeChild(videoEl);
        }
      }
      if (animId) {
        cancelAnimationFrame(animId);
      }

      mainCanvas.removeEventListener("click", onCanvasClick);
      propMediaChroma.removeEventListener("change", onChromaChange);
      mediaModalChromaColorBtn.removeEventListener("click", onColorBtnClick);
      propMediaChromaColor.removeEventListener("input", onColorInputChange);
      mediaModalChromaColorHex.removeEventListener("input", onHexTextInputChange);
      propMediaSimilarity.removeEventListener("input", onSimilarityChange);
      propMediaBlend.removeEventListener("input", onBlendChange);
      btnMediaModalCancel.removeEventListener("click", onCancel);
      btnMediaModalSave.removeEventListener("click", onSave);
    };

    const onCancel = () => {
      cleanup();
    };

    const onSave = () => {
      const overlaysCopy = [...(stateManager.project.media_overlays || [])];
      if (overlaysCopy[idx]) {
        // Preserve existing X, Y, Width, Height bounds untouched!
        overlaysCopy[idx].type = propMediaType.value;
        overlaysCopy[idx].loop_mode = propMediaLoop.value;
        overlaysCopy[idx].chroma_key = propMediaChroma.checked;
        overlaysCopy[idx].chroma_color = propMediaChromaColor.value;
        overlaysCopy[idx].chroma_similarity = parseFloat(propMediaSimilarity.value) || 0.3;
        overlaysCopy[idx].chroma_blend = parseFloat(propMediaBlend.value) || 0.05;

        stateManager.updateProjectField("media_overlays", overlaysCopy);
        syncMediaOverlaysList();
        refreshViewport();
        showToast("Saved media overlay settings!", "success");
      }
      cleanup();
    };

    btnMediaModalCancel.addEventListener("click", onCancel);
    btnMediaModalSave.addEventListener("click", onSave);
  } catch (err) {
    showToast(`Failed to open settings: ${err}`, "error");
    console.error("openMediaSettingsModal error:", err);
  }
}

function openTextEditModal(type: string) {
  let initialValue = "";
  if (type === "text") {
    initialValue = stateManager.project.text_settings.enabled !== false 
      ? (stateManager.project.text_template || "PART {part}")
      : "";
  } else if (type.startsWith("extra-")) {
    const idx = parseInt(type.split("-")[1]);
    const overlays = stateManager.project.extra_overlays || [];
    initialValue = overlays[idx] ? overlays[idx].text : "";
  }

  textEditInput.value = initialValue;
  textEditModal.style.display = "flex";
  textEditInput.focus();
  textEditInput.select();

  const cleanup = () => {
    textEditModal.style.display = "none";
    btnTextEditCancel.removeEventListener("click", onCancel);
    btnTextEditSave.removeEventListener("click", onSave);
    textEditInput.removeEventListener("keydown", onKeyDown);
  };

  const onCancel = () => {
    cleanup();
  };

  const onSave = () => {
    const newVal = textEditInput.value.trim();
    if (newVal) {
      if (type === "text") {
        stateManager.project.text_template = newVal;
        stateManager.updateProjectField("text_template", newVal);
        propTextTemplate.value = newVal;
      } else if (type.startsWith("extra-")) {
        const idx = parseInt(type.split("-")[1]);
        const overlays = [...(stateManager.project.extra_overlays || [])];
        if (overlays[idx]) {
          overlays[idx].text = newVal;
          stateManager.updateProjectField("extra_overlays", overlays);
          syncExtraOverlaysList();
        }
      }
      refreshViewport();
      showToast("Updated text overlay content!", "success");
    }
    cleanup();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      onSave();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
  };

  btnTextEditCancel.addEventListener("click", onCancel);
  btnTextEditSave.addEventListener("click", onSave);
  textEditInput.addEventListener("keydown", onKeyDown);
}

function customizeNumberInputs() {
  document.querySelectorAll('input[type="number"]').forEach((input) => {
    const numInput = input as HTMLInputElement;
    if (numInput.parentElement?.classList.contains('custom-number-wrapper')) return;

    // Create wrapper
    const wrapper = document.createElement('div');
    wrapper.className = 'custom-number-wrapper';
    
    // Copy parent flex / margin/ layout properties to wrapper so layouts don't break
    const computedStyle = window.getComputedStyle(numInput);
    if (numInput.style.flex || computedStyle.flexGrow !== '0' || computedStyle.flexShrink !== '1') {
      wrapper.style.flex = numInput.style.flex || computedStyle.flex;
      numInput.style.flex = "1";
    }
    if (numInput.style.width || computedStyle.width !== 'auto') {
      wrapper.style.width = numInput.style.width || computedStyle.width;
      numInput.style.width = "100%";
    }
    if (numInput.style.margin) {
      wrapper.style.margin = numInput.style.margin;
      numInput.style.margin = "0";
    }
    if (numInput.style.marginTop) wrapper.style.marginTop = numInput.style.marginTop;
    if (numInput.style.marginBottom) wrapper.style.marginBottom = numInput.style.marginBottom;
    if (numInput.style.marginLeft) wrapper.style.marginLeft = numInput.style.marginLeft;
    if (numInput.style.marginRight) wrapper.style.marginRight = numInput.style.marginRight;

    // Move input inside wrapper
    numInput.parentNode?.insertBefore(wrapper, numInput);
    wrapper.appendChild(numInput);

    // Create custom spinners container
    const spinnerContainer = document.createElement('div');
    spinnerContainer.className = 'custom-number-spinners';

    // Up button
    const btnUp = document.createElement('button');
    btnUp.type = 'button';
    btnUp.className = 'custom-spinner-btn custom-spinner-up';
    btnUp.innerHTML = `<svg width="8" height="6" viewBox="0 0 24 16" fill="currentColor"><path d="M12 0L24 16H0L12 0Z"/></svg>`;
    
    // Down button
    const btnDown = document.createElement('button');
    btnDown.type = 'button';
    btnDown.className = 'custom-spinner-btn custom-spinner-down';
    btnDown.innerHTML = `<svg width="8" height="6" viewBox="0 0 24 16" fill="currentColor"><path d="M12 16L0 0H24L12 16Z"/></svg>`;

    spinnerContainer.appendChild(btnUp);
    spinnerContainer.appendChild(btnDown);
    wrapper.appendChild(spinnerContainer);

    const changeVal = (up: boolean) => {
      if (numInput.disabled) return;
      const step = parseFloat(numInput.step) || 1;
      const val = parseFloat(numInput.value) || 0;
      const min = numInput.min ? parseFloat(numInput.min) : -Infinity;
      const max = numInput.max ? parseFloat(numInput.max) : Infinity;

      let newVal = val + (up ? step : -step);
      
      const stepStr = numInput.step;
      if (stepStr && stepStr.includes('.')) {
        const decimals = stepStr.split('.')[1].length;
        newVal = parseFloat(newVal.toFixed(decimals));
      } else {
        newVal = Math.round(newVal);
      }

      if (newVal >= min && newVal <= max) {
        numInput.value = newVal.toString();
        numInput.dispatchEvent(new Event('input', { bubbles: true }));
        numInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
    };

    // Long press support for convenience
    let intervalId: any = null;
    let timeoutId: any = null;

    const startInterval = (up: boolean) => {
      changeVal(up);
      timeoutId = setTimeout(() => {
        intervalId = setInterval(() => changeVal(up), 80);
      }, 300);
    };

    const stopInterval = () => {
      if (timeoutId) clearTimeout(timeoutId);
      if (intervalId) clearInterval(intervalId);
    };

    btnUp.addEventListener('mousedown', (e) => {
      if (e.button === 0) startInterval(true);
    });
    btnDown.addEventListener('mousedown', (e) => {
      if (e.button === 0) startInterval(false);
    });

    window.addEventListener('mouseup', stopInterval);
  });
}

async function tryLoadAutosave(): Promise<boolean> {
  try {
    const projectData = await TauriService.loadAutosave();
    if (!projectData) return false;

    showToast("Resuming your last project session...", "success");
    
    stateManager.isSavingEnabled = false;
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
          console.error("Failed to import asset during autosave load:", prjAsset.path, e);
        }
      }
      
      stateManager.isSavingEnabled = true;

      if (stateManager.assets.length > 0) {
        selectAsset(stateManager.assets[0], false);
        toggleDashboard(false);
        return true;
      }
    }
    
    stateManager.isSavingEnabled = true;
    toggleDashboard(false);
    return true;
  } catch (err) {
    console.error("Failed to load autosave project:", err);
    stateManager.isSavingEnabled = true;
    return false;
  }
}

async function triggerNewProject() {
  const confirmed = await showModal({
    title: "New Project",
    message: "Are you sure you want to start a new project? All unsaved changes will be lost.",
    icon: "🗑️",
    confirmText: "New Project",
    cancelText: "Keep Working",
    danger: true,
  });
  if (!confirmed) return;
  
  resetProjectSession();
  stateManager.updateProjectDirectly(stateManager.project);
  toggleDashboard(true);
  showToast("Started a new empty project session.", "success");
}

async function triggerOpenProject() {
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
}

async function triggerSaveProject() {
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
}

