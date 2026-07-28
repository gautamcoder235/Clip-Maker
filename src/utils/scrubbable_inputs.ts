/**
 * Utility to turn all numeric inputs (<input type="number">) and their associated labels
 * into scrubbable controls where users can click and drag up/down to adjust values.
 */

export class ScrubbableInputManager {
  public static isScrubbing = false;
  private static isDragging = false;
  private static activeInput: HTMLInputElement | null = null;
  private static startY = 0;
  private static startVal = 0;
  private static hasMoved = false;

  public static init() {
    // Attach scrub behavior to all current and future numeric inputs
    document.addEventListener("mousedown", (e) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      let input: HTMLInputElement | null = null;

      if (target.tagName === "INPUT" && (target as HTMLInputElement).type === "number") {
        input = target as HTMLInputElement;
      } else if (target.tagName === "LABEL") {
        const forId = target.getAttribute("for");
        if (forId) {
          const associated = document.getElementById(forId) as HTMLInputElement | null;
          if (associated && associated.type === "number") {
            input = associated;
          }
        }
        if (!input) {
          // Check sibling or parent control group
          const siblingInput = target.parentElement?.querySelector("input[type='number']") as HTMLInputElement | null;
          if (siblingInput) input = siblingInput;
        }
      }

      if (!input || input.disabled || input.readOnly) return;

      this.activeInput = input;
      this.startY = e.clientY;
      this.startVal = parseFloat(input.value) || 0;
      this.hasMoved = false;
      this.isDragging = false;

      const onMouseMove = (moveEvt: MouseEvent) => {
        const dy = this.startY - moveEvt.clientY; // Up is positive increase

        if (!this.hasMoved && Math.abs(dy) > 3) {
          this.hasMoved = true;
          this.isDragging = true;
          ScrubbableInputManager.isScrubbing = true;
          document.body.style.cursor = "ns-resize";
          document.body.style.userSelect = "none";
        }

        if (this.isDragging && this.activeInput) {
          moveEvt.preventDefault();
          moveEvt.stopPropagation();

          const stepAttr = parseFloat(this.activeInput.step);
          let baseStep = !isNaN(stepAttr) && stepAttr > 0 ? stepAttr : 1;

          if (moveEvt.shiftKey) baseStep *= 10;
          if (moveEvt.altKey) baseStep *= 0.1;

          let newVal = this.startVal + dy * baseStep;

          // Precision rounding to avoid floating point precision artifacts (e.g. 5.0000000001)
          const decimals = baseStep.toString().split(".")[1]?.length || 0;
          newVal = parseFloat(newVal.toFixed(Math.max(0, decimals)));

          // Check min & max bounds
          const minAttr = parseFloat(this.activeInput.min);
          const maxAttr = parseFloat(this.activeInput.max);

          if (!isNaN(minAttr) && newVal < minAttr) newVal = minAttr;
          if (!isNaN(maxAttr) && newVal > maxAttr) newVal = maxAttr;

          this.activeInput.value = newVal.toString();
          this.activeInput.dispatchEvent(new Event("input", { bubbles: true }));
        }
      };

      const onMouseUp = (upEvt: MouseEvent) => {
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);

        if (this.isDragging && this.activeInput) {
          upEvt.preventDefault();
          upEvt.stopPropagation();

          ScrubbableInputManager.isScrubbing = false;
          this.activeInput.dispatchEvent(new Event("input", { bubbles: true }));
          this.activeInput.dispatchEvent(new Event("change", { bubbles: true }));
          this.activeInput.blur();
        }

        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        ScrubbableInputManager.isScrubbing = false;
        this.isDragging = false;
        this.activeInput = null;
        this.hasMoved = false;
      };

      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    });
  }
}
