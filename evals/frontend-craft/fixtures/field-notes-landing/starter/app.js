const reservation = document.querySelector("#reservation");
document.querySelectorAll("[data-workshop]").forEach((link) => {
  link.addEventListener("click", () => {
    reservation.elements.workshop.value = link.dataset.workshop;
  });
});
reservation.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!reservation.reportValidity()) return;
  const workshop = reservation.elements.workshop.selectedOptions[0].textContent;
  document.querySelector("#confirmation").textContent =
    `Preview ready for ${reservation.elements.name.value.trim()}: ${workshop}. No booking was sent and no payment was taken.`;
});
