document.getElementById("year").textContent = new Date().getFullYear();

const EMAILJS = {
  publicKey: "jHBLKGolnhq9ksvYW",
  serviceId: "service_4o36zjk",
  businessTemplateId: "template_ejpg0tc",
  customerTemplateId: "template_ght9stw"
};

emailjs.init({ publicKey: EMAILJS.publicKey });

const form = document.getElementById("projectForm");
const statusEl = document.getElementById("formStatus");
const submitButton = document.getElementById("submitButton");

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  statusEl.className = "form-status";

  const formData = new FormData(form);
  const customer_name = (formData.get("name") || "").trim();
  const customer_phone = (formData.get("phone") || "").trim();
  const customer_email = (formData.get("email") || "").trim();
  const customer_description = (formData.get("description") || "").trim();
  const customer_systems = (formData.get("systems") || "").trim();
  const honeypot = (formData.get("website") || "").trim();

  // Silently accept obvious bot submissions.
  if (honeypot) {
    form.reset();
    showStatus("Thanks — your request was sent successfully.", false);
    return;
  }

  if (!customer_name || !customer_description) {
    showStatus("Please enter your name and a short description.", true);
    return;
  }

  if (!customer_email && !customer_phone) {
    const continueAnyway = window.confirm(
      "You didn't include an email address or phone number, so there will be no way to contact you. Submit anyway?"
    );
    if (!continueAnyway) return;
  }

  const templateParams = {
    customer_name,
    customer_phone: customer_phone || "Not provided",
    customer_email: customer_email || "Not provided",
    customer_description,
    customer_systems: customer_systems || "Not provided / unsure",
    page_url: window.location.href
  };

  submitButton.disabled = true;
  submitButton.innerHTML = "Sending…";

  try {
    // Always notify Samson's Automation about the new inquiry.
    await emailjs.send(
      EMAILJS.serviceId,
      EMAILJS.businessTemplateId,
      templateParams
    );

    // Only send the customer receipt when they supplied an email address.
    if (customer_email) {
      await emailjs.send(
        EMAILJS.serviceId,
        EMAILJS.customerTemplateId,
        templateParams
      );
    }

    form.reset();
    showStatus(
      customer_email
        ? "Message sent! A confirmation email is on its way. If you don't see it within a few minutes, please check your Spam or Junk folder."
        : "Thanks — your request was sent successfully.",
      false
    );
  } catch (error) {
    console.error("EmailJS submission failed:", error);
    showStatus(
      "The form couldn't send right now. Please email SamsonsAutomations@gmail.com directly.",
      true
    );
  } finally {
    submitButton.disabled = false;
    submitButton.innerHTML = "Send Message <span>→</span>";
  }
});

function showStatus(message, isError) {
  statusEl.textContent = message;
  statusEl.className = `form-status ${isError ? "error" : "success"}`;
}
