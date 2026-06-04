document.addEventListener("DOMContentLoaded", () => {
    const contactForm = document.getElementById("contactForm");
    const submitBtn = document.getElementById("submitBtn");

    if (!contactForm) return;

    contactForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        submitBtn.disabled = true;
        submitBtn.textContent = "Submitting...";

        const formData = {
            name: document.getElementById("name").value.trim(),
            email: document.getElementById("email").value.trim(),
            phone: document.getElementById("phone").value.trim(),
            company: document.getElementById("company").value.trim(),
            source: document.getElementById("source").value,
            message: document.getElementById("message").value.trim()
        };

        try {
            const response = await fetch(
                "http://localhost:5000/api/public/leads",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify(formData)
                }
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || "Failed to submit lead");
            }

            alert("✅ Lead submitted successfully!");
            console.log(data);

            contactForm.reset();

        } catch (error) {
            console.error(error);
            alert("❌ " + error.message);
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = "Submit";
        }
    });
});