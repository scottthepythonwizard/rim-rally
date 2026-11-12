document.addEventListener("click", (event) => {
  const trigger = event.target.closest("[data-open-dialog]");
  if (trigger) document.getElementById(trigger.dataset.openDialog).showModal();

  if (event.target instanceof HTMLDialogElement) event.target.close();

  const link = event.target.closest("[data-mobile-menu] a");
  if (link) link.closest("[data-mobile-menu]").open = false;
});

if (window.location.pathname === "/") {
  function updateCurrentSection() {
    const about = window.location.hash === "#about";
    document.querySelectorAll("[data-home-link]").forEach((link) => {
      if (about) link.removeAttribute("aria-current");
      else link.setAttribute("aria-current", "page");
    });
    document.querySelectorAll("[data-about-link]").forEach((link) => {
      if (about) link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
    });
  }

  updateCurrentSection();
  window.addEventListener("hashchange", updateCurrentSection);
}
