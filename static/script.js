// brexna-ai/static/script.js
document.addEventListener('DOMContentLoaded', function () {
    const config = document.getElementById('chat-config');
    const PERSONALITIES_DATA = JSON.parse(config.dataset.personalities);
    const ENABLE_MULTIPLE_PERSONALITIES_JS = config.dataset.multiplePersonalities === 'true';

    // Always present elements
    const chatBox = document.getElementById('chat-box');
    const userInput = document.getElementById('user-input');
    const sendButton = document.getElementById('send-button');
    const micButton = document.getElementById('mic-button');
    const typingIndicator = document.getElementById('typing-indicator');
    const stopSpeakingButton = document.getElementById('stop-speaking-button');

    const personalityModal = document.getElementById('personality-modal');
    const modalCloseButton = document.querySelector('.modal-close-button'); // Refers to personality modal's close button
    const savePersonalityButton = document.getElementById('save-personality-button');

    // Elements for personality selection and associated speech settings (may be null if disabled)
    const modalPersonalitySelect = document.getElementById('modal-personality-select');
    const changePersonalityButton = document.getElementById('change-personality-button');
    const modalVoiceSelectPersonalityModal = document.getElementById('modal-voice-select');
    const voiceSelectorContainerPersonalityModal = document.querySelector('#personality-modal .voice-selector');

    // These refer to the personality display label in the header. It's now conditionally rendered.
    const currentPersonalityDisplay = document.getElementById('current-personality-display');

    // New elements for the standalone speech settings modal (always present)
    const speechSettingsModal = document.getElementById('speech-settings-modal');
    const toggleSpeechSettingsButton = document.getElementById('toggle-speech-settings-button');
    const speechModalCloseButton = document.getElementById('speech-modal-close-button');
    const saveSpeechSettingsButton = document.getElementById('save-speech-settings-button');
    const modalVoiceSelectStandalone = document.getElementById('modal-voice-select-standalone');
    const voiceSelectorContainerStandalone = document.querySelector('#speech-settings-modal .voice-selector');

    const initialGreetingMarkup = chatBox.innerHTML;

    let recognition;
    let sending = false;
    let voiceSessionActive = false;
    let playbackId = 0;
    let voices = [];
    let selectedVoice = null;
    let currentSelectedPersonality = 'brexna'; // Default to brexna

    let sessionId = crypto.randomUUID();
    localStorage.setItem('chatSessionId', sessionId);
    console.log('Generated new session ID on refresh:', sessionId);

    const MAX_SPEECH_CHUNK_LENGTH = 500;

    // --- Utility Functions ---

    function updatePersonalityDisplay(personalityKey) {
        if (currentPersonalityDisplay) {
            if (ENABLE_MULTIPLE_PERSONALITIES_JS && typeof PERSONALITIES_DATA !== 'undefined' && PERSONALITIES_DATA[personalityKey]) {
                const personalityName = PERSONALITIES_DATA[personalityKey].name;
                currentPersonalityDisplay.textContent = `Current: ${personalityName}`;
            } else if (!ENABLE_MULTIPLE_PERSONALITIES_JS) {
                currentPersonalityDisplay.textContent = `Current: Brexna: Default`;
            }
        }
    }

    function populateVoiceList(targetSelectElement) {
        if (!('speechSynthesis' in window)) {
            return;
        }

        // Ensure targetSelectElement is not null
        if (!targetSelectElement) return;

        // Get the corresponding voice selector container for the given select element
        let voiceSelectorContainer;
        if (targetSelectElement === modalVoiceSelectPersonalityModal) {
            voiceSelectorContainer = voiceSelectorContainerPersonalityModal;
        } else if (targetSelectElement === modalVoiceSelectStandalone) {
            voiceSelectorContainer = voiceSelectorContainerStandalone;
        }

        // Speech is always enabled, so always show the voice selector
        if (voiceSelectorContainer) {
            voiceSelectorContainer.classList.add('visible');
        }

        voices = window.speechSynthesis.getVoices();
        targetSelectElement.innerHTML = '';

        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = 'Default Browser Voice';
        targetSelectElement.appendChild(defaultOption);

        let storedVoiceURI = localStorage.getItem('selectedVoiceURI');
        let preferredVoiceFound = false;

        voices.forEach(voice => {
            const option = document.createElement('option');
            option.value = voice.voiceURI;
            option.textContent = `${voice.name} (${voice.lang})`;
            if (voice.default) {
                option.textContent += ' - Default';
            }
            targetSelectElement.appendChild(option);

            if (storedVoiceURI && voice.voiceURI === storedVoiceURI) {
                selectedVoice = voice;
                preferredVoiceFound = true;
            }
        });

        if (!preferredVoiceFound) {
            selectedVoice = voices.find(
                voice => voice.lang === 'en-GB' && voice.name.includes('Google UK English Male')
            ) || voices.find(
                voice => voice.lang === 'en-US' && voice.name.includes('Google US English')
            ) || voices.find(voice => voice.lang.startsWith('en')) || (voices.length > 0 ? voices[0] : null);

            if (selectedVoice) {
                localStorage.setItem('selectedVoiceURI', selectedVoice.voiceURI);
            } else {
                localStorage.removeItem('selectedVoiceURI');
            }
        }

        targetSelectElement.value = selectedVoice ? selectedVoice.voiceURI : '';
    }

    function checkAndPopulateVoices() {
        if (!('speechSynthesis' in window)) {
            return;
        }

        // Only try to populate if voices are not yet loaded
        if (window.speechSynthesis.getVoices().length === 0) {
            setTimeout(() => {
                // Call populateVoiceList for both (if they exist) as voices might just be loading
                if (modalVoiceSelectPersonalityModal) populateVoiceList(modalVoiceSelectPersonalityModal);
                populateVoiceList(modalVoiceSelectStandalone); // Always populate standalone
            }, 200);
            setTimeout(checkAndPopulateVoices, 1000); // Keep checking
        } else {
            // If voices are loaded and not yet populated
            if (voices.length === 0) {
                if (modalVoiceSelectPersonalityModal) populateVoiceList(modalVoiceSelectPersonalityModal);
                populateVoiceList(modalVoiceSelectStandalone);
            }
        }
    }

    // Initialize speech synthesis and voice loading
    if ('speechSynthesis' in window) {
        console.log("SpeechSynthesis API detected. Setting up voice loading.");
        speechSynthesis.onvoiceschanged = () => {
            // Re-populate and re-evaluate visibility for both dropdowns when voices change
            if (modalVoiceSelectPersonalityModal) populateVoiceList(modalVoiceSelectPersonalityModal);
            populateVoiceList(modalVoiceSelectStandalone);
        };

        // Initial populate calls
        if (modalVoiceSelectPersonalityModal) populateVoiceList(modalVoiceSelectPersonalityModal);
        populateVoiceList(modalVoiceSelectStandalone);
        checkAndPopulateVoices(); // Start checking if voices load later
    } else {
        console.warn("Web Speech API (SpeechRecognition) not supported in this browser.");
        micButton.style.display = 'none';

        if (modalVoiceSelectPersonalityModal) modalVoiceSelectPersonalityModal.disabled = true;
        if (voiceSelectorContainerPersonalityModal) voiceSelectorContainerPersonalityModal.style.display = 'none';

        modalVoiceSelectStandalone.disabled = true;
        if (voiceSelectorContainerStandalone) voiceSelectorContainerStandalone.style.display = 'none';
    }

    window.addEventListener('pagehide', function () {
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
        }
    });

    // Initialize Speech Recognition
    if ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) {
        recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.lang = 'en-GB';

        recognition.onstart = function () {
            micButton.classList.add('listening');
            micButton.title = 'Listening... Click to stop.';
            console.log('Speech recognition started.');
        };

        recognition.onresult = function (event) {
            if (sending || !voiceSessionActive) return;
            let interimTranscript = '';
            let finalTranscript = '';

            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    finalTranscript += event.results[i][0].transcript;
                } else {
                    interimTranscript += event.results[i][0].transcript;
                }
            }

            userInput.value = finalTranscript || interimTranscript;
            userInput.style.height = 'auto';
            userInput.style.height = (userInput.scrollHeight) + 'px';

            if (finalTranscript.trim()) {
                console.log('Final Speech recognized:', finalTranscript);
                sendMessage(true); // Pass true because input is speech
            }
        };

        recognition.onerror = function (event) {
            console.error('Speech recognition error:', event.error);
            micButton.classList.remove('listening');
            micButton.title = 'Speech input error.';
        };

        recognition.onend = function () {
            micButton.classList.remove('listening');
            micButton.title = 'Speak your message';
            console.log('Speech recognition ended.');
        };

    } else {
        console.warn('Web Speech API (SpeechRecognition) not supported in this browser.');
        micButton.style.display = 'none';
    }

    // --- Modal Functions ---

    function openPersonalityModal() {
        if (!ENABLE_MULTIPLE_PERSONALITIES_JS || !modalPersonalitySelect) {
            console.log("Personality modal not accessible or disabled.");
            return;
        }

        modalPersonalitySelect.value = localStorage.getItem('selectedPersonality') || 'brexna';

        populateVoiceList(modalVoiceSelectPersonalityModal);
        if (modalVoiceSelectPersonalityModal) {
            modalVoiceSelectPersonalityModal.value = localStorage.getItem('selectedVoiceURI') || '';
        }

        personalityModal.classList.add('visible');
        document.body.style.overflow = 'hidden';
        requestAnimationFrame(() => document.querySelector('.modal.visible .modal-close-button')?.focus());
    }

    function closePersonalityModal() {
        personalityModal.classList.remove('visible');
        changePersonalityButton?.focus();
        document.body.style.overflow = '';
    }

    function savePersonalitySelection() {
        sessionId = crypto.randomUUID();
        localStorage.setItem('chatSessionId', sessionId);
        console.log('Personality changed. New session ID generated:', sessionId);

        chatBox.innerHTML = initialGreetingMarkup;

        if (modalPersonalitySelect && ENABLE_MULTIPLE_PERSONALITIES_JS) {
            currentSelectedPersonality = modalPersonalitySelect.value;
        } else {
            currentSelectedPersonality = 'brexna';
        }
        localStorage.setItem('selectedPersonality', currentSelectedPersonality);

        updatePersonalityDisplay(currentSelectedPersonality);
        closePersonalityModal();
    }

    function openSpeechSettingsModal() {
        populateVoiceList(modalVoiceSelectStandalone); // Ensure voices are populated and visibility updated
        modalVoiceSelectStandalone.value = localStorage.getItem('selectedVoiceURI') || '';

        speechSettingsModal.classList.add('visible');
        document.body.style.overflow = 'hidden';
        requestAnimationFrame(() => document.querySelector('.modal.visible .modal-close-button')?.focus());
    }

    function closeSpeechSettingsModal() {
        speechSettingsModal.classList.remove('visible');
        toggleSpeechSettingsButton?.focus();
        document.body.style.overflow = '';
    }

    function saveSpeechSettings() {
        localStorage.setItem('selectedVoiceURI', modalVoiceSelectStandalone.value);
        selectedVoice = window.speechSynthesis?.getVoices().find(v => v.voiceURI === modalVoiceSelectStandalone.value) || null;
        console.log("Speech settings saved.");
        closeSpeechSettingsModal();
    }

    // --- Event Listeners ---

    document.addEventListener('keydown', event => {
        const modal = document.querySelector('.modal.visible');
        if (!modal) return;
        if (event.key === 'Escape') {
            if (modal === personalityModal) closePersonalityModal();
            else closeSpeechSettingsModal();
        }
        if (event.key === 'Tab') {
            const controls = [...modal.querySelectorAll('button, select')].filter(el => !el.disabled && el.getClientRects().length);
            const first = controls[0], last = controls[controls.length - 1];
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        }
    });

    // Common modal close listeners
    modalCloseButton.addEventListener('click', closePersonalityModal);
    speechModalCloseButton.addEventListener('click', closeSpeechSettingsModal);

    // Save buttons
    savePersonalityButton.addEventListener('click', savePersonalitySelection);
    saveSpeechSettingsButton.addEventListener('click', saveSpeechSettings);

    // Toggle buttons
    if (changePersonalityButton) {
        changePersonalityButton.addEventListener('click', openPersonalityModal);
    }
    if (toggleSpeechSettingsButton) {
        toggleSpeechSettingsButton.addEventListener('click', openSpeechSettingsModal);
    }

    // Click outside modal to close
    personalityModal.addEventListener('click', function (event) {
        if (event.target === personalityModal) {
            closePersonalityModal();
        }
    });
    speechSettingsModal.addEventListener('click', function (event) {
        if (event.target === speechSettingsModal) {
            closeSpeechSettingsModal();
        }
    });

    // Handle initial personality and speech setting loading
    if (!ENABLE_MULTIPLE_PERSONALITIES_JS) {
        localStorage.setItem('selectedPersonality', 'brexna');
        currentSelectedPersonality = 'brexna';

        populateVoiceList(modalVoiceSelectStandalone); // Ensure visibility and population on load
        modalVoiceSelectStandalone.value = localStorage.getItem('selectedVoiceURI') || '';

    } else {
        const storedPersonality = localStorage.getItem('selectedPersonality');
        if (!storedPersonality) {
            localStorage.setItem('selectedPersonality', 'brexna');
            currentSelectedPersonality = 'brexna';
            openPersonalityModal(); // Open personality modal if no personality is stored
        } else {
            currentSelectedPersonality = storedPersonality;
            populateVoiceList(modalVoiceSelectPersonalityModal); // Ensure visibility and population on load
            if (modalVoiceSelectPersonalityModal) {
                modalVoiceSelectPersonalityModal.value = localStorage.getItem('selectedVoiceURI') || '';
            }
        }
        updatePersonalityDisplay(currentSelectedPersonality); // Update display for current personality
    }

    // These event listeners simply update local storage and selectedVoice.
    if (modalVoiceSelectPersonalityModal) {
        modalVoiceSelectPersonalityModal.addEventListener('change', function () {
            localStorage.setItem('selectedVoiceURI', this.value);
            selectedVoice = window.speechSynthesis.getVoices().find(v => v.voiceURI === this.value) || null;
            if (modalVoiceSelectStandalone) {
                modalVoiceSelectStandalone.value = this.value; // Sync value
            }
        });
    }
    modalVoiceSelectStandalone.addEventListener('change', function () {
        localStorage.setItem('selectedVoiceURI', this.value);
        selectedVoice = window.speechSynthesis.getVoices().find(v => v.voiceURI === this.value) || null;
        if (modalVoiceSelectPersonalityModal) {
            modalVoiceSelectPersonalityModal.value = this.value; // Sync value
        }
    });

    // --- Core Chat Functionality ---
    sendButton.addEventListener('click', () => sendMessage(false)); // Call with false for typed input
    micButton.addEventListener('click', toggleSpeechInput);

    stopSpeakingButton.addEventListener('click', () => {
        voiceSessionActive = false;
        playbackId++;
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
            stopSpeakingButton.style.display = 'none';
        }
    });

    userInput.addEventListener('keypress', function (event) {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            sendMessage(false); // Call with false for typed input
        }
    });

    userInput.addEventListener('input', function () {
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight) + 'px';
        chatBox.scrollTop = chatBox.scrollHeight;
    });

    function renderMarkdown(element, text) {
        if (window.marked && window.DOMPurify) {
            element.innerHTML = DOMPurify.sanitize(marked.parse(text));
        } else {
            element.textContent = text;
        }
    }

    function addMessage(type, content) {
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message', `${type}-message`);

        const avatarDiv = document.createElement('div');
        avatarDiv.classList.add('avatar', `${type}-avatar`);
        avatarDiv.textContent = (type === 'user') ? 'You' : 'AI';

        const contentDiv = document.createElement('div');
        contentDiv.classList.add('message-content');

        if (type === 'user') {
            contentDiv.textContent = content;
        } else {
            renderMarkdown(contentDiv, content);
        }

        if (type === 'user') {
            messageDiv.appendChild(contentDiv);
            messageDiv.appendChild(avatarDiv);
        } else {
            messageDiv.appendChild(avatarDiv);
            messageDiv.appendChild(contentDiv);
        }
        chatBox.appendChild(messageDiv);
        chatBox.scrollTop = chatBox.scrollHeight;
        return contentDiv;
    }

    function typeMessage(element, text) {
        renderMarkdown(element, text);
        if (window.Prism) Prism.highlightAllUnder(element);
        const codeBlocks = element.querySelectorAll('pre');
        codeBlocks.forEach(preBlock => {
            const codeElement = preBlock.querySelector('code');
            if (codeElement && !preBlock.querySelector('.copy-button')) {
                const copyButton = document.createElement('button');
                copyButton.classList.add('copy-button');
                copyButton.textContent = 'Copy';
                copyButton.title = 'Copy code to clipboard';
                const codeToCopy = codeElement.textContent;

                copyButton.addEventListener('click', () => {
                    navigator.clipboard.writeText(codeToCopy).then(() => {
                        copyButton.textContent = 'Copied!';
                        copyButton.classList.add('copied');
                        setTimeout(() => {
                            copyButton.textContent = 'Copy';
                            copyButton.classList.remove('copied');
                        }, 2000);
                    }).catch(err => {
                        console.error('Failed to copy code: ', err);
                        copyButton.textContent = 'Error!';
                        copyButton.classList.add('error');
                        setTimeout(() => {
                            copyButton.textContent = 'Copy';
                            copyButton.classList.remove('error');
                        }, 2000);
                    });
                });
                preBlock.appendChild(copyButton);
            }
        });
    }

    function speakMessage(text, resumeListening = true) {
        const currentPlaybackId = ++playbackId;
        return new Promise(resolve => {
            if (!('speechSynthesis' in window)) {
                resolve();
                return;
            }

            window.speechSynthesis.cancel();
            stopSpeakingButton.style.display = 'flex';

            let cleanedText = text;
            cleanedText = cleanedText.replace(/^(\*|\-|\+) /gm, '');
            cleanedText = cleanedText.replace(/(\*\*|__|\*|_)([^\s].*?)\1/g, '$2');
            cleanedText = cleanedText.replace(/```[\s\S]*?```/g, '');
            cleanedText = cleanedText.replace(/`([^`]+?)`/g, '$1');
            cleanedText = cleanedText.replace(/^(#+)\s*/gm, '');
            cleanedText = cleanedText.replace(/\n\n+/g, '. ');
            cleanedText = cleanedText.replace(/\n/g, ' ');
            cleanedText = cleanedText.replace(/\s+/g, ' ').trim();

            const words = cleanedText.split(' ');
            const numChunks = Math.ceil(words.length / MAX_SPEECH_CHUNK_LENGTH);
            let currentChunkIndex = 0;

            const speakNextChunk = () => {
                if (currentChunkIndex < numChunks) {
                    const start = currentChunkIndex * MAX_SPEECH_CHUNK_LENGTH;
                    const end = Math.min((currentChunkIndex + 1) * MAX_SPEECH_CHUNK_LENGTH, words.length);
                    const chunk = words.slice(start, end).join(' ');

                    const utterance = new SpeechSynthesisUtterance(chunk);

                    const currentVoices = window.speechSynthesis.getVoices();
                    const storedVoiceURI = localStorage.getItem('selectedVoiceURI');
                    let voiceToUse = null;

                    if (storedVoiceURI) {
                        voiceToUse = currentVoices.find(v => v.voiceURI === storedVoiceURI);
                    }

                    let activeVoiceSelect = ENABLE_MULTIPLE_PERSONALITIES_JS
                        ? (modalVoiceSelectPersonalityModal)
                        : (modalVoiceSelectStandalone);

                    if (!voiceToUse && activeVoiceSelect && activeVoiceSelect.value) {
                        voiceToUse = currentVoices.find(v => v.voiceURI === activeVoiceSelect.value);
                    }

                    if (!voiceToUse && currentVoices.length > 0) {
                        voiceToUse = currentVoices.find(
                            voice => voice.lang === 'en-GB' && voice.name.includes('Google UK English Male')
                        ) || currentVoices.find(
                            voice => voice.lang === 'en-US' && voice.name.includes('Google US English')
                        ) || currentVoices.find(voice => voice.lang.startsWith('en')) || currentVoices[0];
                    }

                    if (voiceToUse) {
                        utterance.voice = voiceToUse;
                        utterance.lang = voiceToUse.lang;
                    } else {
                        console.warn("No suitable voice found for speaking. Using browser's default.");
                    }

                    utterance.rate = 1.12;
                    utterance.pitch = 1.0;

                    utterance.onend = () => {
                        if (currentPlaybackId !== playbackId) { resolve(); return; }
                        currentChunkIndex++;
                        if (currentChunkIndex < numChunks) {
                            speakNextChunk();
                        } else {
                            stopSpeakingButton.style.display = 'none';
                            resolve();
                            // Auto-enable speech-to-text after AI finishes speaking
                            finishSpeechReply(resumeListening);
                        }
                    };

                    utterance.onerror = (event) => {
                        if (currentPlaybackId !== playbackId) { resolve(); return; }
                        console.error('Speech synthesis error:', event.error);
                        stopSpeakingButton.style.display = 'none';
                        if (!resumeListening) finishSpeechReply(false);
                        resolve();
                    };

                    window.speechSynthesis.speak(utterance);
                } else {
                    stopSpeakingButton.style.display = 'none';
                    resolve();
                    // Auto-enable speech-to-text after AI finishes speaking
                    finishSpeechReply(resumeListening);
                }
            };
            speakNextChunk();
        });
    }

    function finishSpeechReply(resumeListening) {
        if (resumeListening && voiceSessionActive) {
            if (recognition && !micButton.classList.contains('listening')) recognition.start();
        } else {
            voiceSessionActive = false;
            if (recognition) recognition.stop();
            micButton.classList.remove('listening');
            micButton.title = 'Speak your message';
        }
    }

    function isGoodbye(message) {
        return /\b(?:good[\s-]*bye|bye(?:[\s-]*bye)?)\b/i.test(message);
    }

    function removeInitialGreeting() {
        const currentInitialGreeting = document.getElementById('initial-greeting');
        if (currentInitialGreeting && !currentInitialGreeting.classList.contains('hidden')) {
            currentInitialGreeting.classList.add('hidden');
            currentInitialGreeting.addEventListener('transitionend', () => {
                currentInitialGreeting.remove();
            }, { once: true });
        }
    }

    function toggleSpeechInput() {
        if (!recognition) return;
        playbackId++;
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
            stopSpeakingButton.style.display = 'none';
        }
        if (micButton.classList.contains('listening')) {
            voiceSessionActive = false;
            recognition.stop();
        } else {
            voiceSessionActive = true;
            userInput.value = '';
            recognition.start();
        }
    }

    async function sendMessage(isSpeechInput = false) { // Added isSpeechInput parameter
        const message = userInput.value.trim();
        const selectedPersonality = currentSelectedPersonality;
        const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

        if (message === '' || sending) return;
        // Latch the end of the voice session before any asynchronous reply callbacks.
        if (isSpeechInput && isGoodbye(message)) voiceSessionActive = false;
        sending = true;
        sendButton.disabled = true;
        if (changePersonalityButton) changePersonalityButton.disabled = true;

        removeInitialGreeting();

        addMessage('user', message);
        userInput.value = '';
        userInput.style.height = 'auto';
        chatBox.scrollTop = chatBox.scrollHeight;

        typingIndicator.classList.add('visible');
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 220000);
        const waitingNotice = document.createElement('span');
        waitingNotice.className = 'waiting-notice';
        waitingNotice.textContent = 'A.I. is thinking...';
        waitingNotice.setAttribute('role', 'status');
        typingIndicator.appendChild(waitingNotice);
        const slowNotice = setTimeout(() => {
            waitingNotice.textContent = 'Gemini is taking longer; the server may be retryingâ€¦';
        }, 15000);

        try {
            const response = await fetch('/chat', {
                method: 'POST',
                signal: controller.signal,
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: message,
                    personality: selectedPersonality,
                    timezone: userTimezone,
                    sessionId: sessionId
                })
            });

            const data = await response.json();
            if (response.ok) {
                if (typeof data.response !== 'string' || !data.response.trim()) {
                    throw new Error('The server returned an empty reply.');
                }
                const botContentDiv = addMessage('bot', '');
                typeMessage(botContentDiv, data.response);
                // Speech playback must not keep the chat request locked.
                if (isSpeechInput && ('speechSynthesis' in window)) {
                    speakMessage(data.response, !isGoodbye(message)).catch(error => console.error('Speech playback failed:', error));
                }

            } else {
                console.error('Server error:', data.error);
                addMessage('bot', `Error: ${data.error || 'Unknown server error.'}`);
                if (!userInput.value) userInput.value = message;
            }
            typingIndicator.classList.remove('visible');
            chatBox.scrollTop = chatBox.scrollHeight;
        } catch (error) {
            console.error('Network or client-side error:', error);
            typingIndicator.classList.remove('visible');
            addMessage('bot', error.name === 'AbortError'
                ? 'Error: The request took too long. Please try again.'
                : `Error: Could not complete the chat request. (${error.message || error})`);
            if (!userInput.value) userInput.value = message;
            chatBox.scrollTop = chatBox.scrollHeight;
        } finally {
            clearTimeout(timeout);
            clearTimeout(slowNotice);
            waitingNotice.remove();
            typingIndicator.classList.remove('visible');
            sending = false;
            sendButton.disabled = false;
            if (changePersonalityButton) changePersonalityButton.disabled = false;
        }
    }
});

