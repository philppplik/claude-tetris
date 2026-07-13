/* =========================================================
   main.js — scroll reveal, sticky-nav state, copy buttons.
   ========================================================= */

document.addEventListener("DOMContentLoaded", () => {

  /* ---- Scroll reveal ---- */
  const reveals = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });
    reveals.forEach((el) => io.observe(el));
  } else {
    reveals.forEach((el) => el.classList.add("is-visible"));
  }

  /* ---- Nav scrolled state ---- */
  const nav = document.getElementById("nav");
  const onScroll = () => {
    if (window.scrollY > 12) nav.classList.add("is-scrolled");
    else nav.classList.remove("is-scrolled");
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ---- Copy buttons ---- */
  document.querySelectorAll(".copy-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const text = btn.getAttribute("data-copy");
      try {
        await navigator.clipboard.writeText(text);
        const original = btn.textContent;
        btn.textContent = "Copied!";
        btn.style.background = "rgba(74,222,128,.25)";
        btn.style.color = "#4ade80";
        setTimeout(() => {
          btn.textContent = original;
          btn.style.background = "";
          btn.style.color = "";
        }, 1400);
      } catch {
        btn.textContent = "Copy failed";
        setTimeout(() => (btn.textContent = "Copy"), 1400);
      }
    });
  });

  /* ---- Smooth anchor scroll (respects reduced motion) ---- */
  document.querySelectorAll('a[href^="#"]').forEach((a) => {
    a.addEventListener("click", (e) => {
      const id = a.getAttribute("href");
      if (id.length > 1) {
        const target = document.querySelector(id);
        if (target) {
          e.preventDefault();
          target.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }
    });
  });
});
