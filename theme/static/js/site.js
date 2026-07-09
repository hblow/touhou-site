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
  var lastFocus = null;
  if (modal) {
    var modalImg = document.getElementById("char-modal-img");
    var modalRank = document.getElementById("char-modal-rank");
    var modalTitle = document.getElementById("char-modal-title");
    var modalBody = document.getElementById("char-modal-body");

    function openChar(id, triggerBtn) {
      var tpl = document.getElementById(id);
      if (!tpl) return;
      var node = tpl.content.querySelector(".char-modal__payload");
      if (!node) return;
      lastFocus = triggerBtn || document.activeElement;
      modalTitle.textContent = node.getAttribute("data-name") || "";
      modalRank.textContent = node.getAttribute("data-rank") ? "#" + node.getAttribute("data-rank") : "";
      var portrait = node.getAttribute("data-portrait") || "";
      if (portrait) {
        modalImg.src = portrait;
        modalImg.alt = (node.getAttribute("data-name") || "") + " portrait";
        modalImg.hidden = false;
      } else {
        modalImg.removeAttribute("src");
        modalImg.hidden = true;
      }
      var full = node.querySelector(".char-modal__fulltext");
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
      if (lastFocus && lastFocus.focus) lastFocus.focus();
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
  }

  /* ——— Media detail modal ——— */
  var mediaModal = document.getElementById("media-modal");
  if (mediaModal) {
    var mediaImg = document.getElementById("media-modal-img");
    var mediaTitle = document.getElementById("media-modal-title");
    var mediaBody = document.getElementById("media-modal-body");
    var mediaFlags = document.getElementById("media-modal-flags");
    var mediaChars = document.getElementById("media-modal-chars");
    var mediaByline = document.getElementById("media-modal-byline");
    var mediaLinkWrap = document.getElementById("media-modal-link-wrap");
    var mediaLink = document.getElementById("media-modal-link");
    var mediaLastFocus = null;

    function openMedia(id, triggerBtn) {
      var tpl = document.getElementById(id);
      if (!tpl) return;
      var node = tpl.content.querySelector(".media-modal__payload");
      if (!node) return;
      mediaLastFocus = triggerBtn || document.activeElement;

      var name = node.getAttribute("data-name") || "";
      var byline = node.getAttribute("data-byline") || "";
      var link = node.getAttribute("data-link") || "";
      var cover = node.getAttribute("data-cover") || "";
      var chars = node.getAttribute("data-chars") || "";
      var fav = node.getAttribute("data-fav") === "1";
      var official = node.getAttribute("data-official") === "1";
      var full = node.querySelector(".media-modal__fulltext");

      mediaTitle.textContent = name;
      if (cover) {
        mediaImg.src = cover;
        mediaImg.alt = "Cover of " + name;
        mediaImg.hidden = false;
      } else {
        mediaImg.removeAttribute("src");
        mediaImg.alt = "";
        mediaImg.hidden = true;
      }

      mediaFlags.innerHTML = "";
      if (fav) {
        var f = document.createElement("span");
        f.className = "pill pill--fav";
        f.textContent = "★ fav";
        mediaFlags.appendChild(f);
      }
      if (official) {
        var o = document.createElement("span");
        o.className = "pill";
        o.textContent = "official";
        mediaFlags.appendChild(o);
      }

      mediaChars.innerHTML = "";
      chars.split(",").forEach(function (c) {
        c = c.trim();
        if (!c) return;
        var li = document.createElement("li");
        li.className = "char-tag";
        li.textContent = c;
        mediaChars.appendChild(li);
      });

      if (byline) {
        mediaByline.innerHTML = '<span class="media-row__byline-label">Author</span> <strong></strong>';
        mediaByline.querySelector("strong").textContent = byline;
        mediaByline.hidden = false;
      } else {
        mediaByline.textContent = "";
        mediaByline.hidden = true;
      }

      mediaBody.innerHTML = full ? full.innerHTML : "";

      if (link) {
        mediaLink.href = link;
        mediaLinkWrap.hidden = false;
      } else {
        mediaLinkWrap.hidden = true;
      }

      mediaModal.hidden = false;
      document.documentElement.classList.add("media-modal-open");
      var closeBtn = mediaModal.querySelector(".media-modal__close");
      if (closeBtn) closeBtn.focus();
    }

    function closeMedia() {
      if (mediaModal.hidden) return;
      mediaModal.hidden = true;
      document.documentElement.classList.remove("media-modal-open");
      mediaBody.innerHTML = "";
      if (mediaLastFocus && mediaLastFocus.focus) mediaLastFocus.focus();
      mediaLastFocus = null;
    }

    document.querySelectorAll("[data-media-open]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        openMedia(btn.getAttribute("data-media-id"), btn);
      });
    });
    mediaModal.querySelectorAll("[data-media-close]").forEach(function (el) {
      el.addEventListener("click", closeMedia);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !mediaModal.hidden) {
        e.preventDefault();
        closeMedia();
      }
    });
  }
})();
