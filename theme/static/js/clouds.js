/**
 * Clouds-parting intro — session gate + reduced motion + skip.
 * sessionStorage key: touhou-site:clouds-seen
 */
(function () {
  var STORAGE_KEY = "touhou-site:clouds-seen";
  var html = document.documentElement;
  var enabled = html.getAttribute("data-clouds-enabled") === "true";
  var overlay = document.getElementById("cloud-intro");
  if (!enabled || !overlay) return;

  function prefersReducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function alreadySeen() {
    try {
      return sessionStorage.getItem(STORAGE_KEY) === "1";
    } catch (e) {
      return false;
    }
  }

  function markSeen() {
    try {
      sessionStorage.setItem(STORAGE_KEY, "1");
    } catch (e) { /* private mode */ }
  }

  function finish() {
    markSeen();
    overlay.setAttribute("hidden", "");
    overlay.setAttribute("aria-hidden", "true");
    overlay.setAttribute("aria-busy", "false");
    overlay.classList.remove("is-revealing");
    if (overlay.inert !== undefined) overlay.inert = true;
    html.classList.remove("is-clouds-active");
    html.classList.add("is-revealed");
    var main = document.getElementById("main");
    if (main) {
      main.setAttribute("tabindex", "-1");
      main.focus({ preventScroll: true });
    }
  }

  function revealAnimated() {
    overlay.classList.add("is-revealing");
    overlay.setAttribute("aria-busy", "false");
    var done = false;
    function onEnd(ev) {
      if (done) return;
      if (ev && ev.target && !ev.target.classList.contains("cloud-intro__layer")) return;
      done = true;
      overlay.removeEventListener("transitionend", onEnd);
      finish();
    }
    overlay.addEventListener("transitionend", onEnd);
    window.setTimeout(function () {
      if (!done) {
        done = true;
        finish();
      }
    }, 1800);
  }

  function start() {
    if (alreadySeen() || prefersReducedMotion()) {
      finish();
      return;
    }
    overlay.removeAttribute("hidden");
    overlay.setAttribute("aria-hidden", "false");
    html.classList.add("is-clouds-active");
    var skip = document.getElementById("cloud-skip");
    if (skip) {
      skip.addEventListener("click", function () {
        finish();
      });
      // Auto-start parting shortly after paint
      window.requestAnimationFrame(function () {
        window.setTimeout(revealAnimated, 400);
      });
    } else {
      revealAnimated();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
