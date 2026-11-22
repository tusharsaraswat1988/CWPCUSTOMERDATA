/**
 * CWP Detailers & Motors - Careers Application Controller
 * High-Reliability JSON + Base64 Upload Pipeline
 */

(function () {
  'use strict';

  const form = document.getElementById('jobAppForm');
  const successModal = document.getElementById('careerSuccessModal');
  const resumeInput = document.getElementById('appResume');
  const fileLabel = document.getElementById('fileUploadLabel');

  let fileBase64 = null;
  let fileOriginalName = null;

  resumeInput?.addEventListener('change', () => {
    if (resumeInput.files && resumeInput.files[0]) {
      const file = resumeInput.files[0];
      if (file.size > 10 * 1024 * 1024) {
        alert('File size exceeds 10MB. Please choose a smaller document or photo.');
        resumeInput.value = '';
        return;
      }
      fileOriginalName = file.name;
      fileLabel.textContent = `Selected: ${file.name}`;
      fileLabel.style.color = 'var(--md-sys-color-primary)';
      fileLabel.style.fontWeight = 'bold';

      const reader = new FileReader();
      reader.onload = function (evt) {
        fileBase64 = evt.target.result;
      };
      reader.readAsDataURL(file);
    } else {
      fileBase64 = null;
      fileOriginalName = null;
      fileLabel.textContent = 'Click to upload Resume / Biodata / Photo (Optional)';
      fileLabel.style.color = '';
      fileLabel.style.fontWeight = '';
    }
  });

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.textContent = 'Submitting Application...';
    submitBtn.disabled = true;

    const name = document.getElementById('appName').value.trim();
    const mobile = document.getElementById('appMobile').value.trim();
    const age = document.getElementById('appAge').value.trim();
    const gender = document.getElementById('appGender').value;
    const city = document.getElementById('appCity').value.trim();
    const email = document.getElementById('appEmail').value.trim();
    const remark = document.getElementById('appRemark').value.trim();

    const cleanPhone = mobile.replace(/\D/g, '').slice(-10);
    if (!name || cleanPhone.length < 10) {
      alert('Please enter your Full Name and a valid 10-digit Mobile Number.');
      submitBtn.textContent = originalText;
      submitBtn.disabled = false;
      return;
    }

    const payload = {
      name,
      mobile: cleanPhone,
      age: age ? parseInt(age, 10) || null : null,
      gender: gender || null,
      city: city || 'Varanasi',
      email: email || null,
      remark: remark || null,
      fileData: fileBase64 ? {
        base64: fileBase64.split(',')[1] || fileBase64,
        filename: fileOriginalName || 'applicant_resume.pdf',
        mimeType: fileBase64.split(';')[0]?.replace('data:', '') || 'application/octet-stream'
      } : null
    };

    try {
      const res = await fetch('/api/careers/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Submission failed');
      }

      // Success
      document.getElementById('applicantDisplayName').textContent = name;
      window.savedApplicantData = { name, mobile: cleanPhone, city: city || 'Varanasi' };
      successModal?.classList.add('open');
      form.reset();
      fileBase64 = null;
      fileOriginalName = null;
      fileLabel.textContent = 'Click to upload Resume / Biodata / Photo (Optional)';
      fileLabel.style.color = '';
      fileLabel.style.fontWeight = '';
    } catch (err) {
      alert('Application error: ' + err.message);
    } finally {
      submitBtn.textContent = originalText;
      submitBtn.disabled = false;
    }
  });

  window.closeCareerSuccess = function () {
    successModal?.classList.remove('open');
  };

  window.chatHRWhatsApp = function () {
    const data = window.savedApplicantData || { name: 'Applicant', mobile: '', city: 'Varanasi' };
    const text = encodeURIComponent(`Namaste CWP HR Team! Maine CWP Careers page par job ke liye apply kiya hai.\nNaam: ${data.name}\nMobile: ${data.mobile}\nCity: ${data.city}\nKripya interview details share karein.`);
    window.open(`https://wa.me/917054007733?text=${text}`, '_blank');
    window.closeCareerSuccess();
  };

})();
