const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const indexPath = path.join(rootDir, 'Index.html');
const appJsPath = path.join(rootDir, 'public', 'js', 'app.js');

// 1. Update Index.html to add #whatsAppImageShareModal
let indexHtml = fs.readFileSync(indexPath, 'utf8');

const targetModalAnchor = '<!-- Image Modal for Full Preview -->';
const newModalHtml = `<!-- WhatsApp Image Direct Share & Paste Helper Modal -->
  <div id="whatsAppImageShareModal" class="camera-modal-overlay" style="display: none;" onclick="closeWhatsAppImageModal()">
    <div class="modal-card-box" onclick="event.stopPropagation()" style="max-width: 440px; width: 94%; text-align: center; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 48px rgba(0,0,0,0.4);">
      <div class="modal-card-header" style="justify-content: space-between; display: flex; align-items: center; padding: 14px 18px; background: #0f172a; color: #fff;">
        <h3 class="modal-card-title" style="display: flex; align-items: center; gap: 8px; font-size: 15px; margin: 0; color: #fff;">
          <span style="font-size: 18px;">📸</span>
          <span>WhatsApp फोटो शेयर</span>
        </h3>
        <button type="button" class="modal-close-x" onclick="closeWhatsAppImageModal()" style="color: #fff; background: transparent; border: none; font-size: 18px; cursor: pointer;">✕</button>
      </div>
      <div style="padding: 18px;">
        <div style="position: relative; margin-bottom: 14px; border-radius: 12px; overflow: hidden; border: 2px solid var(--border-color); background: #0f172a;">
          <img id="waShareModalPreviewImg" src="" alt="Car Cleaning Photo" style="max-height: 220px; width: 100%; object-fit: contain; display: block; margin: 0 auto;">
          <div style="position: absolute; bottom: 0; left: 0; right: 0; background: rgba(15,23,42,0.85); color: #fff; padding: 6px 12px; font-size: 12px; display: flex; justify-content: space-between; align-items: center;">
            <span id="waShareModalVehTag" style="font-weight: 800; font-family: monospace; color: #38bdf8;">🚗 गाड़ी</span>
            <span id="waShareModalStaffTag" style="color: #e2e8f0; font-size: 11px;">👨‍🔧 Staff</span>
          </div>
        </div>

        <div style="background: #ecfdf5; border: 1.5px solid #a7f3d0; border-radius: 10px; padding: 12px 14px; margin-bottom: 14px; text-align: left;">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 3px;">
            <span style="font-size: 18px;">📋</span>
            <strong style="color: #065f46; font-size: 13.5px;">सफाई फोटो कॉपी हो चुकी है!</strong>
          </div>
          <p style="font-size: 12.5px; color: #047857; margin: 0; line-height: 1.4;">
            WhatsApp खुलने पर चैट में केवल <strong>Paste (Ctrl+V)</strong> दबाएं और सीधे फोटो भेजें।
          </p>
        </div>

        <div style="display: flex; flex-direction: column; gap: 8px;">
          <button type="button" id="btnWaModalOpenChat" class="btn-clean-wa wa-ready" style="height: 42px; font-size: 13.5px; justify-content: center; width: 100%;" onclick="proceedToWhatsAppChat()">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91C2.13 13.66 2.59 15.36 3.45 16.86L2.05 22L7.3 20.62C8.75 21.41 10.38 21.83 12.04 21.83C17.5 21.83 21.95 17.38 21.95 11.92C21.95 6.46 17.5 2 12.04 2M12.05 20.15C10.56 20.15 9.11 19.76 7.85 19L7.55 18.83L4.43 19.65L5.26 16.61L5.06 16.29C4.24 14.99 3.81 13.47 3.81 11.91C3.81 7.37 7.5 3.68 12.04 3.68C14.25 3.68 16.31 4.54 17.87 6.1C19.42 7.66 20.28 9.72 20.28 11.92C20.28 16.46 16.59 20.15 12.05 20.15Z"/></svg>
            <span>WhatsApp खोलें (Open WhatsApp)</span>
          </button>
          <div style="display: flex; gap: 8px;">
            <button type="button" class="btn-report-action" style="flex: 1; justify-content: center; height: 38px; font-size: 12px;" onclick="copyWaModalImageAgain()">
              <span>📋</span> फिर से कॉपी करें
            </button>
            <button type="button" class="btn-report-action" style="flex: 1; justify-content: center; height: 38px; font-size: 12px;" onclick="downloadWaModalImage()">
              <span>📥</span> फोटो डाउनलोड
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>\n  `;

if (!indexHtml.includes('id="whatsAppImageShareModal"')) {
  if (indexHtml.includes(targetModalAnchor)) {
    indexHtml = indexHtml.replace(targetModalAnchor, newModalHtml + targetModalAnchor);
    fs.writeFileSync(indexPath, indexHtml, 'utf8');
    console.log('✅ Added #whatsAppImageShareModal to Index.html');
  } else {
    console.error('Target modal anchor not found in Index.html!');
    process.exit(1);
  }
} else {
  console.log('ℹ️ #whatsAppImageShareModal already present in Index.html');
}

// 2. Update public/js/app.js WhatsApp Sharing Functions
let appJs = fs.readFileSync(appJsPath, 'utf8');

const normAppJs = appJs.replace(/\r\n/g, '\n');

// Find start and end of WhatsApp sharing block
const startMarker = 'function handleCustomerWhatsAppShare(custId, index) {';
const endMarker = 'function getStaffWhatsAppGroup() {';

const startIdx = normAppJs.indexOf(startMarker);
if (startIdx === -1) {
  console.error('startMarker not found in app.js!');
  process.exit(1);
}

const getStaffGroupIdx = normAppJs.indexOf(endMarker, startIdx);
if (getStaffGroupIdx === -1) {
  console.error('endMarker not found in app.js!');
  process.exit(1);
}

// Find closing brace of getStaffWhatsAppGroup
const closingBraceIdx = normAppJs.indexOf('}', getStaffGroupIdx);
const endIdx = closingBraceIdx + 1;

const newWaBlock = `/* =========================================================================
       WHATSAPP DIRECT IMAGE DISPATCH & SHARING SYSTEM (Photo-First)
       ========================================================================= */
    var currentWaModalBlob = null;
    var currentWaModalFile = null;
    var currentWaModalItem = null;
    var currentWaModalSrc = '';

    function getCleaningPhotoFile(photoUrlOrBase64, vehicleNumber, callback) {
      var filename = 'CWP_' + (vehicleNumber ? String(vehicleNumber).replace(/[^a-zA-Z0-9]/g, '_') : 'Car') + '_' + Date.now() + '.jpg';

      if (!photoUrlOrBase64) {
        if (callback) callback(null, null);
        return;
      }

      // 1. Data URL (Base64)
      if (typeof photoUrlOrBase64 === 'string' && photoUrlOrBase64.startsWith('data:')) {
        try {
          var arr = photoUrlOrBase64.split(',');
          var mimeMatch = arr[0].match(/:(.*?);/);
          var mime = (mimeMatch && mimeMatch[1]) || 'image/jpeg';
          var bstr = atob(arr[1]);
          var n = bstr.length;
          var u8arr = new Uint8Array(n);
          while (n--) {
            u8arr[n] = bstr.charCodeAt(n);
          }
          var blob = new Blob([u8arr], { type: mime });
          var file = (typeof File !== 'undefined') ? new File([blob], filename, { type: mime }) : blob;
          if (callback) callback(file, blob);
          return;
        } catch (e) {
          console.warn('Failed to parse base64 photo for WhatsApp:', e);
        }
      }

      // 2. Relative or Remote URL
      var fetchUrl = photoUrlOrBase64;
      if (typeof fetchUrl === 'string' && fetchUrl.startsWith('/')) {
        fetchUrl = (typeof window !== 'undefined' && window.location ? window.location.origin : '') + fetchUrl;
      }

      if (typeof fetch === 'function') {
        fetch(fetchUrl)
          .then(function(res) { return res.blob(); })
          .then(function(blob) {
            var mime = blob.type || 'image/jpeg';
            var file = (typeof File !== 'undefined') ? new File([blob], filename, { type: mime }) : blob;
            if (callback) callback(file, blob);
          })
          .catch(function(err) {
            console.warn('Failed to fetch photo blob for WhatsApp:', err);
            if (callback) callback(null, null);
          });
      } else {
        if (callback) callback(null, null);
      }
    }

    function copyImageBlobToClipboard(blob, callback) {
      if (typeof navigator === 'undefined' || !navigator || !navigator.clipboard || typeof navigator.clipboard.write !== 'function' || typeof ClipboardItem === 'undefined') {
        if (callback) callback(false);
        return;
      }

      // If already image/png, write directly
      if (blob.type === 'image/png') {
        var item = new ClipboardItem({ 'image/png': blob });
        navigator.clipboard.write([item])
          .then(function() { if (callback) callback(true); })
          .catch(function(e) { if (callback) callback(false); });
        return;
      }

      // Convert to image/png via offscreen canvas
      if (typeof document !== 'undefined' && document.createElement) {
        var img = new Image();
        var url = (typeof URL !== 'undefined' && URL.createObjectURL) ? URL.createObjectURL(blob) : '';
        img.onload = function() {
          if (url && URL.revokeObjectURL) URL.revokeObjectURL(url);
          var canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          var ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);
          canvas.toBlob(function(pngBlob) {
            if (pngBlob) {
              var clipItem = new ClipboardItem({ 'image/png': pngBlob });
              navigator.clipboard.write([clipItem])
                .then(function() { if (callback) callback(true); })
                .catch(function(err) { if (callback) callback(false); });
            } else {
              if (callback) callback(false);
            }
          }, 'image/png');
        };
        img.onerror = function() {
          if (url && URL.revokeObjectURL) URL.revokeObjectURL(url);
          if (callback) callback(false);
        };
        img.src = url;
      } else {
        if (callback) callback(false);
      }
    }

    function handleCustomerWhatsAppShare(custId, index) {
      var item = state.currentStaffFilteredList && state.currentStaffFilteredList[index];
      if (!item) return;

      var compData = getCustomerCompletionData(custId);
      var photoUrl = (compData && compData.photoUrl) || '';
      var completedAt = (compData && compData.completedAt) || new Date().toISOString();

      triggerCleaningWhatsAppShare(item, photoUrl, completedAt);
    }

    function triggerCleaningWhatsAppShare(item, photoUrl, completedAtTime, fallbackDataUrl) {
      var vName = (item && (item.vehicle || item.vehicleNumbers)) || 'Car';
      var cName = (item && (item.customerName || item.name)) || 'Customer';
      var sName = (state.staffData && state.staffData.staffName) || state.activeStaffName || 'Staff';

      var effectivePhoto = photoUrl || fallbackDataUrl || (typeof currentSnappedPhotoBase64 !== 'undefined' ? currentSnappedPhotoBase64 : '');

      if (!effectivePhoto && item) {
        var custId = item.id || item.customerId || (typeof getCustomerStableId === 'function' ? getCustomerStableId(item) : '');
        if (custId) {
          var compData = getCustomerCompletionData(custId);
          if (compData && compData.photoUrl) {
            effectivePhoto = compData.photoUrl;
          }
        }
      }

      if (!effectivePhoto) {
        showToast('सफाई फोटो नहीं मिली। कृपया पहले फोटो लें।', '⚠️');
        return;
      }

      getCleaningPhotoFile(effectivePhoto, vName, function(file, blob) {
        // 1. Mobile First: Native Web Share API with actual IMAGE file
        if (file && typeof navigator !== 'undefined' && navigator && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
          navigator.share({
            files: [file],
            title: 'CWP Cleaning Proof - ' + vName
          }).catch(function(err) {
            // If user did not simply cancel the dialog, open desktop helper
            if (err && err.name !== 'AbortError') {
              openDesktopWhatsAppImageHelper(blob, file, item, effectivePhoto);
            }
          });
          return;
        }

        // 2. Desktop / WhatsApp Web / Fallback: Copy Image & Open Helper
        openDesktopWhatsAppImageHelper(blob, file, item, effectivePhoto);
      });
    }

    function openDesktopWhatsAppImageHelper(blob, file, item, photoSrc) {
      currentWaModalBlob = blob;
      currentWaModalFile = file;
      currentWaModalItem = item;
      currentWaModalSrc = photoSrc;

      var vName = (item && (item.vehicle || item.vehicleNumbers)) || 'Car';
      var sName = (state.staffData && state.staffData.staffName) || state.activeStaffName || 'Staff';

      var previewImg = document.getElementById('waShareModalPreviewImg');
      var vehTag = document.getElementById('waShareModalVehTag');
      var staffTag = document.getElementById('waShareModalStaffTag');
      var modal = document.getElementById('whatsAppImageShareModal');

      if (previewImg) previewImg.src = photoSrc;
      if (vehTag) vehTag.textContent = '🚗 ' + vName;
      if (staffTag) staffTag.textContent = '👨‍🔧 ' + sName;

      // Copy image to clipboard immediately
      if (blob) {
        copyImageBlobToClipboard(blob, function(success) {
          if (success) {
            showToast('📸 फोटो कॉपी हो चुकी है! WhatsApp में Ctrl+V (Paste) करें।', 'success');
          }
        });
      }

      if (modal) {
        modal.style.display = 'flex';
      }
    }

    function closeWhatsAppImageModal() {
      var modal = document.getElementById('whatsAppImageShareModal');
      if (modal) modal.style.display = 'none';
    }

    function proceedToWhatsAppChat() {
      var targetGroup = getStaffWhatsAppGroup();
      var targetUrl = 'https://web.whatsapp.com/';

      if (targetGroup) {
        var cleanTarget = targetGroup.trim();
        if (cleanTarget.startsWith('http://') || cleanTarget.startsWith('https://')) {
          targetUrl = cleanTarget;
        } else if (/^\\d{10}$/.test(cleanTarget)) {
          targetUrl = 'https://web.whatsapp.com/send?phone=91' + cleanTarget;
        }
      }

      window.open(targetUrl, '_blank');
      showToast('चैट खुलते ही Ctrl+V (Paste) दबाकर फोटो भेजें', 'info');
      closeWhatsAppImageModal();
    }

    function copyWaModalImageAgain() {
      if (currentWaModalBlob) {
        copyImageBlobToClipboard(currentWaModalBlob, function(success) {
          if (success) {
            showToast('✓ फोटो क्लिपबोर्ड में कॉपी हो गई!', 'success');
          } else {
            showToast('क्लिपबोर्ड कॉपी असफल। नीचे डाउनलोड बटन का उपयोग करें।', 'warning');
          }
        });
      }
    }

    function downloadWaModalImage() {
      if (!currentWaModalSrc) return;
      var a = document.createElement('a');
      a.href = currentWaModalSrc;
      a.download = 'CWP_Car_Clean_' + Date.now() + '.jpg';
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      showToast('फोटो डाउनलोड हो गई!', 'success');
    }

    function getStaffWhatsAppGroup() {
      var staffId = state.activeStaffId || 'STF01';
      return localStorage.getItem('cwp_staff_wa_group_' + staffId) || localStorage.getItem('cwp_staff_wa_group') || '';
    }`;

let updatedAppJs = normAppJs.slice(0, startIdx) + newWaBlock + normAppJs.slice(endIdx);

// Also expose new modal functions on window
const exportTarget = 'window.handleCustomerWhatsAppShare = handleCustomerWhatsAppShare;';
const newExports = `window.handleCustomerWhatsAppShare = handleCustomerWhatsAppShare;
      window.closeWhatsAppImageModal = closeWhatsAppImageModal;
      window.proceedToWhatsAppChat = proceedToWhatsAppChat;
      window.copyWaModalImageAgain = copyWaModalImageAgain;
      window.downloadWaModalImage = downloadWaModalImage;`;

if (updatedAppJs.includes(exportTarget) && !updatedAppJs.includes('closeWhatsAppImageModal')) {
  updatedAppJs = updatedAppJs.replace(exportTarget, newExports);
}

fs.writeFileSync(appJsPath, updatedAppJs, 'utf8');
console.log('✅ Successfully updated public/js/app.js with direct photo-first WhatsApp dispatching!');
