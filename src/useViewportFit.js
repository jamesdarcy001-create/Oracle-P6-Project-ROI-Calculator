import { useEffect } from "react";

/** Reserved hook — viewport scaling disabled (caused clip/black-screen issues). Layout uses CSS only. */
export function useViewportFit(_phase) {
  useEffect(() => {
    const reset = () => {
      document.querySelectorAll(".land-root, .gi-root, .rv-root, .boot").forEach((el) => {
        el.style.transform = "";
        el.style.width = "";
        el.style.height = "";
        el.style.maxHeight = "";
      });
    };
    reset();
    return reset;
  }, [_phase]);
}
