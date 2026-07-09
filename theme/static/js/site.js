(function () {
  var header = document.querySelector("[data-header]");
  var toggle = document.querySelector("[data-nav-toggle]");
  var nav = document.querySelector("[data-nav]");

  function onScroll() {
    if (!header) return;
    header.classList.toggle("is-scrolled", window.scrollY > 12);
  }
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      var open = toggle.getAttribute("aria-expanded") === "true";
      toggle.setAttribute("aria-expanded", open ? "false" : "true");
      nav.classList.toggle("is-open", !open);
    });
    nav.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", function () {
        toggle.setAttribute("aria-expanded", "false");
        nav.classList.remove("is-open");
      });
    });
  }

  /* ——— Character profile modal ——— */
  var modal = document.getElementById("char-modal");
  if (!modal) return;

  var modalImg = document.getElementById("char-modal-img");
  var modalRank = document.getElementById("char-modal-rank");
  var modalTitle = document.getElementById("char-modal-title");
  var modalBody = document.getElementById("char-modal-body");
  var lastFocus = null;

  function openChar(id, triggerBtn) {
    var tpl = document.getElementById(id);
    if (!tpl) return;
    var node = tpl.content.querySelector(".char-modal__payload");
    if (!node) return;

    lastFocus = triggerBtn || document.activeElement;

    var name = node.getAttribute("data-name") || "";
    var rank = node.getAttribute("data-rank") || "";
    var portrait = node.getAttribute("data-portrait") || "";
    var full = node.querySelector(".char-modal__fulltext");

    modalTitle.textContent = name;
    modalRank.textContent = rank ? "#" + rank : "";
    if (portrait) {
      modalImg.src = portrait;
      modalImg.alt = name + " portrait";
      modalImg.hidden = false;
    } else {
      modalImg.removeAttribute("src");
      modalImg.alt = "";
      modalImg.hidden = true;
    }
    modalBody.innerHTML = full ? full.innerHTML : "";

    modal.hidden = false;
    document.documentElement.classList.add("char-modal-open");

    var closeBtn = modal.querySelector(".char-modal__close");
    if (closeBtn) closeBtn.focus();
  }

  function closeChar() {
    if (modal.hidden) return;
    modal.hidden = true;
    document.documentElement.classList.remove("char-modal-open");
    modalBody.innerHTML = "";
    if (lastFocus && typeof lastFocus.focus === "function") {
      lastFocus.focus();
    }
    lastFocus = null;
  }

  document.querySelectorAll("[data-char-open]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      openChar(btn.getAttribute("data-char-id"), btn);
    });
  });

  modal.querySelectorAll("[data-char-close]").forEach(function (el) {
    el.addEventListener("click", closeChar);
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !modal.hidden) {
      e.preventDefault();
      closeChar();
    }
  });
})();
