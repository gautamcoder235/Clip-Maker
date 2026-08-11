/**
 * Custom Dropdown Component
 * Automatically transforms native HTML <select> elements into accessible,
 * sleek, dark-themed custom dropdown menus matching the app's design system.
 */

export function initCustomSelect(selectEl: HTMLSelectElement): HTMLElement | null {
  if (!selectEl || selectEl.size > 1 || selectEl.multiple) {
    return null;
  }

  // Avoid re-initialization if already wrapped
  if (selectEl.dataset.customSelectInit === "true") {
    const existingWrapper = selectEl.parentElement?.querySelector(`.custom-select-wrapper[data-for="${selectEl.id}"]`) as HTMLElement | null;
    if (existingWrapper) {
      return existingWrapper;
    }
  }

  selectEl.dataset.customSelectInit = "true";
  selectEl.style.display = "none";

  const wrapper = document.createElement("div");
  wrapper.className = "custom-select-wrapper";
  if (selectEl.id) {
    wrapper.dataset.for = selectEl.id;
  }

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "custom-select-trigger";
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-expanded", "false");

  const labelSpan = document.createElement("span");
  labelSpan.className = "custom-select-value";

  const svgChevron = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svgChevron.setAttribute("viewBox", "0 0 24 24");
  svgChevron.setAttribute("width", "14");
  svgChevron.setAttribute("height", "14");
  svgChevron.setAttribute("fill", "none");
  svgChevron.setAttribute("stroke", "currentColor");
  svgChevron.setAttribute("stroke-width", "2.5");
  svgChevron.setAttribute("stroke-linecap", "round");
  svgChevron.setAttribute("stroke-linejoin", "round");
  svgChevron.innerHTML = `<polyline points="6 9 12 15 18 9"></polyline>`;

  trigger.appendChild(labelSpan);
  trigger.appendChild(svgChevron);

  const dropdown = document.createElement("div");
  dropdown.className = "custom-select-dropdown";
  dropdown.setAttribute("role", "listbox");

  wrapper.appendChild(trigger);
  wrapper.appendChild(dropdown);

  if (selectEl.parentNode) {
    selectEl.parentNode.insertBefore(wrapper, selectEl.nextSibling);
  }

  function rebuildOptions() {
    dropdown.innerHTML = "";
    const options = Array.from(selectEl.options);

    options.forEach((opt) => {
      const item = document.createElement("div");
      item.className = "custom-select-option";
      item.setAttribute("role", "option");
      if (opt.value === selectEl.value) {
        item.classList.add("selected");
        item.setAttribute("aria-selected", "true");
        labelSpan.textContent = opt.textContent;
      }
      item.dataset.value = opt.value;
      item.textContent = opt.textContent;

      item.addEventListener("click", (e) => {
        e.stopPropagation();
        if (selectEl.value !== opt.value) {
          selectEl.value = opt.value;
          selectEl.dispatchEvent(new Event("change", { bubbles: true }));
          selectEl.dispatchEvent(new Event("input", { bubbles: true }));
        }
        closeDropdown();
        updateSelectedState();
      });

      dropdown.appendChild(item);
    });

    const activeOpt = selectEl.options[selectEl.selectedIndex];
    if (activeOpt) {
      labelSpan.textContent = activeOpt.textContent;
    }
  }

  function updateSelectedState() {
    const activeOpt = selectEl.options[selectEl.selectedIndex];
    if (activeOpt) {
      labelSpan.textContent = activeOpt.textContent;
    }
    dropdown.querySelectorAll(".custom-select-option").forEach((item) => {
      const el = item as HTMLElement;
      if (el.dataset.value === selectEl.value) {
        el.classList.add("selected");
        el.setAttribute("aria-selected", "true");
      } else {
        el.classList.remove("selected");
        el.removeAttribute("aria-selected");
      }
    });
  }

  function openDropdown() {
    document.querySelectorAll(".custom-select-wrapper.open").forEach((w) => {
      if (w !== wrapper) {
        w.classList.remove("open");
        const tr = w.querySelector(".custom-select-trigger");
        if (tr) tr.setAttribute("aria-expanded", "false");
      }
    });
    wrapper.classList.add("open");
    trigger.setAttribute("aria-expanded", "true");

    // Scroll active item into view
    const selectedItem = dropdown.querySelector(".custom-select-option.selected") as HTMLElement | null;
    if (selectedItem) {
      selectedItem.scrollIntoView({ block: "nearest" });
    }
  }

  function closeDropdown() {
    wrapper.classList.remove("open");
    trigger.setAttribute("aria-expanded", "false");
  }

  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    if (wrapper.classList.contains("open")) {
      closeDropdown();
    } else {
      openDropdown();
    }
  });

  trigger.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeDropdown();
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!wrapper.classList.contains("open")) {
        openDropdown();
      }
    }
  });

  selectEl.addEventListener("change", updateSelectedState);

  const observer = new MutationObserver(() => {
    rebuildOptions();
  });
  observer.observe(selectEl, { childList: true, subtree: true, attributes: true });

  rebuildOptions();
  return wrapper;
}

/**
 * Automatically initializes custom dropdowns for all standard <select> elements in the DOM.
 */
export function initAllCustomSelects(container: HTMLElement | Document = document) {
  const selects = container.querySelectorAll<HTMLSelectElement>("select:not([size]):not([multiple])");
  selects.forEach((sel) => {
    // Skip hidden template/dedicated custom select elements
    if (sel.id === "select-theme" || sel.id === "prop-font-family" || sel.id === "prop-extra-font-family") {
      return;
    }
    initCustomSelect(sel);
  });
}

// Global click listener to close custom dropdown menus on click outside
document.addEventListener("click", (e) => {
  const target = e.target as HTMLElement;
  if (!target.closest(".custom-select-wrapper")) {
    document.querySelectorAll(".custom-select-wrapper.open").forEach((w) => {
      w.classList.remove("open");
      const tr = w.querySelector(".custom-select-trigger");
      if (tr) tr.setAttribute("aria-expanded", "false");
    });
  }
});
