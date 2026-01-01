document.addEventListener('DOMContentLoaded', () => {
    
    // =========================================
    // MOBILE NAVIGATION
    // =========================================
    const menuToggle = document.querySelector('.menu-toggle');
    const navLinks = document.querySelector('.nav-links');
    
    if (menuToggle && navLinks) {
        menuToggle.addEventListener('click', () => {
            navLinks.classList.toggle('active');
            const icon = menuToggle.querySelector('i');
            if (navLinks.classList.contains('active')) {
                icon.classList.remove('fa-bars');
                icon.classList.add('fa-xmark');
            } else {
                icon.classList.remove('fa-xmark');
                icon.classList.add('fa-bars');
            }
        });

        // Close menu when clicking a link
        navLinks.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                navLinks.classList.remove('active');
                const icon = menuToggle.querySelector('i');
                icon.classList.remove('fa-xmark');
                icon.classList.add('fa-bars');
            });
        });
    }

    // =========================================
    // BACKEND WIRING (REAL API INTEGRATION)
    // =========================================
    
    // Global State
    const USER_ID = 'DObRu1vyStbUynoQmTcHBlhs55z2';
    const CONFIG = {
        effectId: 'glassesfilter',
        model: 'image-effects',
        toolType: 'image-effects'
    };
    let currentUploadedUrl = null;

    // --- DOM ELEMENTS ---
    const uploadZone = document.getElementById('upload-zone');
    const fileInput = document.getElementById('file-input');
    const previewImage = document.getElementById('preview-image');
    const generateBtn = document.getElementById('generate-btn');
    const resetBtn = document.getElementById('reset-btn');
    const resultContainer = document.getElementById('result-container');
    const resultPlaceholder = document.getElementById('result-placeholder');
    const loadingState = document.getElementById('loading-state');
    const resultFinal = document.getElementById('result-final');
    const downloadBtn = document.getElementById('download-btn');
    const uploadContent = document.querySelector('.upload-content');

    // --- API HELPER FUNCTIONS ---

    // Generate nanoid for unique filename
    function generateNanoId(length = 21) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    // Upload file to CDN storage
    async function uploadFile(file) {
        const fileExtension = file.name.split('.').pop() || 'jpg';
        const uniqueId = generateNanoId();
        const fileName = uniqueId + '.' + fileExtension;
        
        // Step 1: Get signed URL
        const signedUrlResponse = await fetch(
            'https://api.chromastudio.ai/get-emd-upload-url?fileName=' + encodeURIComponent(fileName),
            { method: 'GET' }
        );
        
        if (!signedUrlResponse.ok) {
            throw new Error('Failed to get signed URL: ' + signedUrlResponse.statusText);
        }
        
        const signedUrl = await signedUrlResponse.text();
        console.log('Got signed URL');
        
        // Step 2: PUT file to signed URL
        const uploadResponse = await fetch(signedUrl, {
            method: 'PUT',
            body: file,
            headers: {
                'Content-Type': file.type
            }
        });
        
        if (!uploadResponse.ok) {
            throw new Error('Failed to upload file: ' + uploadResponse.statusText);
        }
        
        // Step 3: Return download URL
        const downloadUrl = 'https://contents.maxstudio.ai/' + fileName;
        console.log('Uploaded to:', downloadUrl);
        return downloadUrl;
    }

    // Submit generation job
    async function submitImageGenJob(imageUrl) {
        // Configuration Check
        const isVideo = CONFIG.model === 'video-effects'; // False for glassesfilter
        const endpoint = isVideo ? 'https://api.chromastudio.ai/video-gen' : 'https://api.chromastudio.ai/image-gen';
        
        const headers = {
            'Accept': 'application/json, text/plain, */*',
            'Content-Type': 'application/json',
            'sec-ch-ua-platform': '"Windows"',
            'sec-ch-ua': '"Google Chrome";v="143", "Chromium";v="143", "Not A(Brand";v="24"',
            'sec-ch-ua-mobile': '?0'
        };

        let body = {
            model: CONFIG.model,
            toolType: CONFIG.toolType,
            effectId: CONFIG.effectId,
            imageUrl: isVideo ? [imageUrl] : imageUrl,
            userId: USER_ID,
            removeWatermark: true,
            isPrivate: true
        };

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(body)
        });
        
        if (!response.ok) {
            throw new Error('Failed to submit job: ' + response.statusText);
        }
        
        const data = await response.json();
        console.log('Job submitted:', data.jobId, 'Status:', data.status);
        return data;
    }

    // Poll job status
    async function pollJobStatus(jobId) {
        const isVideo = CONFIG.model === 'video-effects';
        const baseUrl = isVideo ? 'https://api.chromastudio.ai/video-gen' : 'https://api.chromastudio.ai/image-gen';
        const POLL_INTERVAL = 2000;
        const MAX_POLLS = 60;
        let polls = 0;
        
        while (polls < MAX_POLLS) {
            const response = await fetch(
                `${baseUrl}/${USER_ID}/${jobId}/status`,
                {
                    method: 'GET',
                    headers: { 'Accept': 'application/json, text/plain, */*' }
                }
            );
            
            if (!response.ok) {
                throw new Error('Failed to check status: ' + response.statusText);
            }
            
            const data = await response.json();
            console.log('Poll', polls + 1, '- Status:', data.status);
            
            if (data.status === 'completed') {
                return data;
            }
            
            if (data.status === 'failed' || data.status === 'error') {
                throw new Error(data.error || 'Job processing failed');
            }
            
            updateStatus('PROCESSING... (' + (polls + 1) + ')');
            await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
            polls++;
        }
        
        throw new Error('Job timed out after ' + MAX_POLLS + ' polls');
    }

    // --- UI HELPERS ---

    function showLoading() {
        if (loadingState) loadingState.style.display = 'flex';
        if (loadingState) loadingState.classList.remove('hidden');
        if (resultContainer) resultContainer.classList.add('loading');
        // Hide placeholders while loading
        if (resultPlaceholder) resultPlaceholder.classList.add('hidden');
        if (resultFinal) resultFinal.classList.add('hidden');
    }

    function hideLoading() {
        if (loadingState) loadingState.style.display = 'none';
        if (loadingState) loadingState.classList.add('hidden');
        if (resultContainer) resultContainer.classList.remove('loading');
    }

    function updateStatus(text) {
        // Update button text to reflect status
        if (generateBtn) {
            if (text.includes('PROCESSING') || text.includes('UPLOADING') || text.includes('SUBMITTING')) {
                generateBtn.disabled = true;
                generateBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> ${text}`;
            } else if (text === 'READY') {
                generateBtn.disabled = false;
                generateBtn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> Apply Effect';
                generateBtn.classList.remove('hidden');
            }
        }
    }

    function showError(msg) {
        alert('Error: ' + msg);
        updateStatus('READY'); // Reset button state
    }

    function showPreview(url) {
        if (previewImage) {
            previewImage.src = url;
            previewImage.classList.remove('hidden');
            previewImage.style.display = 'block';
        }
        if (uploadContent) {
            uploadContent.classList.add('hidden');
        }
    }

    function showResultMedia(url) {
        // Hide placeholder
        if (resultPlaceholder) resultPlaceholder.classList.add('hidden');
        
        // Show result final
        if (resultFinal) {
            resultFinal.src = url + '?t=' + new Date().getTime(); // Prevent caching
            resultFinal.style.display = 'block';
            resultFinal.classList.remove('hidden');
        }
        
        // Scroll on mobile
        if (window.innerWidth < 768 && resultContainer) {
            resultContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    function showDownloadButton(url) {
        if (downloadBtn) {
            downloadBtn.dataset.url = url;
            downloadBtn.disabled = false;
            downloadBtn.classList.remove('hidden');
        }
    }

    function enableGenerateButton() {
        if (generateBtn) {
            generateBtn.disabled = false;
            generateBtn.classList.remove('hidden');
        }
    }

    // --- LOGIC HANDLERS ---

    async function handleFileSelect(file) {
        try {
            // UI Update: Uploading
            if (generateBtn) {
                generateBtn.disabled = true;
                generateBtn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> Uploading...';
                generateBtn.classList.remove('hidden');
            }
            
            // Upload
            const uploadedUrl = await uploadFile(file);
            currentUploadedUrl = uploadedUrl;
            
            // Show Preview
            showPreview(uploadedUrl);
            
            // UI Update: Ready
            updateStatus('READY');
            enableGenerateButton();
            
        } catch (error) {
            console.error(error);
            showError(error.message);
        }
    }

    async function handleGenerate() {
        if (!currentUploadedUrl) return;
        
        try {
            showLoading();
            updateStatus('SUBMITTING JOB...');
            
            // 1. Submit
            const jobData = await submitImageGenJob(currentUploadedUrl);
            updateStatus('JOB QUEUED...');
            
            // 2. Poll
            const result = await pollJobStatus(jobData.jobId);
            
            // 3. Extract Result
            const resultItem = Array.isArray(result.result) ? result.result[0] : result.result;
            const resultUrl = resultItem?.mediaUrl || resultItem?.video || resultItem?.image;
            
            if (!resultUrl) {
                console.error('Response:', result);
                throw new Error('No image URL in response');
            }
            
            // 4. Update UI
            currentUploadedUrl = resultUrl; // For download
            showResultMedia(resultUrl);
            showDownloadButton(resultUrl);
            
            updateStatus('COMPLETE');
            hideLoading();
            
            // Hide generate button after success, show reset
            if (generateBtn) generateBtn.classList.add('hidden');
            if (resetBtn) resetBtn.classList.remove('hidden');
            
        } catch (error) {
            hideLoading();
            updateStatus('ERROR');
            showError(error.message);
        }
    }

    // --- EVENT LISTENERS ---

    // File Input
    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) handleFileSelect(file);
        });
    }

    // Drag & Drop
    if (uploadZone) {
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            uploadZone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
            }, false);
        });

        uploadZone.addEventListener('dragover', () => uploadZone.classList.add('drag-over'));
        uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
        
        uploadZone.addEventListener('drop', (e) => {
            uploadZone.classList.remove('drag-over');
            const file = e.dataTransfer.files[0];
            if (file) handleFileSelect(file);
        });

        uploadZone.addEventListener('click', () => {
            if (fileInput) fileInput.click();
        });
    }

    // Generate Button
    if (generateBtn) {
        generateBtn.addEventListener('click', handleGenerate);
    }

    // Reset Button
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            currentUploadedUrl = null;
            
            // Clear inputs
            if (fileInput) fileInput.value = '';
            
            // Reset Preview
            if (previewImage) {
                previewImage.src = '';
                previewImage.classList.add('hidden');
                previewImage.style.display = 'none';
            }
            if (uploadContent) uploadContent.classList.remove('hidden');
            
            // Reset Results
            if (resultFinal) {
                resultFinal.src = '';
                resultFinal.classList.add('hidden');
                resultFinal.style.display = 'none';
            }
            if (resultPlaceholder) {
                resultPlaceholder.classList.remove('hidden');
                resultPlaceholder.style.display = 'flex';
            }
            if (loadingState) {
                loadingState.classList.add('hidden');
                loadingState.style.display = 'none';
            }
            
            // Reset Buttons
            if (generateBtn) {
                generateBtn.disabled = true;
                generateBtn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> Apply Effect';
                generateBtn.classList.remove('hidden');
            }
            if (resetBtn) resetBtn.classList.add('hidden');
            if (downloadBtn) {
                downloadBtn.disabled = true;
                downloadBtn.classList.add('hidden'); // Optional: hide if preferred
            }
        });
    }

    // Download Button (Robust Proxy Strategy)
    if (downloadBtn) {
        downloadBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const url = downloadBtn.dataset.url;
            if (!url) return;
            
            const originalText = downloadBtn.innerHTML;
            downloadBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Downloading...';
            downloadBtn.disabled = true;
            
            function downloadBlob(blob, filename) {
                const blobUrl = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = blobUrl;
                link.download = filename;
                link.style.display = 'none';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
            }
            
            function getExtension(url, contentType) {
                if (contentType) {
                    if (contentType.includes('jpeg') || contentType.includes('jpg')) return 'jpg';
                    if (contentType.includes('png')) return 'png';
                    if (contentType.includes('webp')) return 'webp';
                }
                const match = url.match(/\.(jpe?g|png|webp)/i);
                return match ? match[1].toLowerCase().replace('jpeg', 'jpg') : 'png';
            }
            
            try {
                // Strategy 1: ChromaStudio Proxy
                const proxyUrl = 'https://api.chromastudio.ai/download-proxy?url=' + encodeURIComponent(url);
                const response = await fetch(proxyUrl);
                if (!response.ok) throw new Error('Proxy failed');
                
                const blob = await response.blob();
                const ext = getExtension(url, response.headers.get('content-type'));
                downloadBlob(blob, 'ai-glasses-result_' + generateNanoId(8) + '.' + ext);
                
            } catch (proxyErr) {
                console.warn('Proxy failed, trying direct fetch:', proxyErr);
                
                // Strategy 2: Direct Fetch
                try {
                    const fetchUrl = url + (url.includes('?') ? '&' : '?') + 't=' + Date.now();
                    const response = await fetch(fetchUrl, { mode: 'cors' });
                    if (response.ok) {
                        const blob = await response.blob();
                        const ext = getExtension(url, response.headers.get('content-type'));
                        downloadBlob(blob, 'ai-glasses-result_' + generateNanoId(8) + '.' + ext);
                        return;
                    }
                    throw new Error('Direct fetch failed');
                } catch (fetchErr) {
                    // Fail gracefully - tell user to save manually
                    alert('Download failed due to browser security. Please right-click the image and select "Save Image As".');
                }
            } finally {
                downloadBtn.innerHTML = originalText;
                downloadBtn.disabled = false;
            }
        });
    }


    // =========================================
    // FAQ ACCORDION (Keep Existing)
    // =========================================
    const accordionItems = document.querySelectorAll('.accordion-item');
    
    accordionItems.forEach(item => {
        const header = item.querySelector('.accordion-header');
        header.addEventListener('click', () => {
            const isActive = item.classList.contains('active');
            accordionItems.forEach(i => {
                i.classList.remove('active');
                i.querySelector('.accordion-content').style.maxHeight = null;
            });
            if (!isActive) {
                item.classList.add('active');
                const content = item.querySelector('.accordion-content');
                content.style.maxHeight = content.scrollHeight + "px";
            }
        });
    });

    // =========================================
    // MODALS (Keep Existing)
    // =========================================
    window.openModal = function(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.add('show');
            document.body.style.overflow = 'hidden';
        }
    };

    window.closeModal = function(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('show');
            document.body.style.overflow = '';
        }
    };

    document.querySelectorAll('[data-modal-target]').forEach(button => {
        button.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = button.getAttribute('data-modal-target');
            openModal(targetId);
        });
    });

    window.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) {
            closeModal(e.target.id);
        }
    });

    // =========================================
    // SCROLL ANIMATIONS (Keep Existing)
    // =========================================
    const observerOptions = {
        threshold: 0.1,
        rootMargin: "0px 0px -50px 0px"
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
            }
        });
    }, observerOptions);

    document.querySelectorAll('.step-card, .gallery-item, .section-header').forEach(el => {
        el.classList.add('fade-in-up');
        observer.observe(el);
    });
});