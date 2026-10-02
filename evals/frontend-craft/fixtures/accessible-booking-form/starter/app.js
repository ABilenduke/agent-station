const form = document.querySelector("#booking");
const message = document.querySelector("#message");
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(form));
  if (!data.name || !data.email || !data.date || !data.purpose || !data.agreement) {
    message.textContent = "Fill in the required fields.";
    return;
  }
  message.textContent = "Sending request...";
  try {
    const result = await window.archiveApi.reserve(data);
    form.hidden = true;
    const confirmation = document.querySelector("#result");
    confirmation.hidden = false;
    confirmation.textContent = `Request received. Reference ${result.reference}. This demo did not send a real request.`;
  } catch (error) {
    message.textContent = error.message;
  }
});
