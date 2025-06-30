document.addEventListener('DOMContentLoaded', function() {
    const chatBox = document.getElementById('chat-box');
    const userInput = document.getElementById('user-input');
    const sendButton = document.getElementById('send-button');
    const micButton = document.getElementById('mic-button');
    const typingIndicator = document.getElementById('typing-indicator');
    const personalitySelect = document.getElementById('personality-select');
    const initialGreeting = document.getElementById('initial-greeting');

    let recognition; // For Web Speech API

    // Initialize Web Speech API if supported
    if ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) {
        recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
        recognition.continuous = false; // Only get one result per speech instance
        recognition.interimResults = false; // Only return final results
        recognition.lang = 'en-US'; // Set language

        recognition.onstart = function() {
            micButton.classList.add('listening');
            micButton.title = 'Listening... Click to stop.';
            console.log('Speech recognition started.');
        };

        recognition.onresult = function(event) {
            const transcript = event.results[0][0].transcript;
            userInput.value = transcript;
            // Adjust textarea height after setting value
            userInput.style.height = 'auto';
            userInput.style.height = (userInput.scrollHeight) + 'px';
            console.log('Speech recognized:', transcript);
            // Optionally, automatically send the message after recognition
            // sendMessage(); 
        };

        recognition.onerror = function(event) {
            console.error('Speech recognition error:', event.error);
            micButton.classList.remove('listening');
            micButton.title = 'Speech input error.';
            // Optionally, display an error message in the chat or to the user
            // addMessage('bot', `Speech input error: ${event.error}`);
        };

        recognition.onend = function() {
            micButton.classList.remove('listening');
            micButton.title = 'Speak your message';
            console.log('Speech recognition ended.');
        };

    } else {
        console.warn('Web Speech API not supported in this browser.');
        micButton.style.display = 'none'; // Hide microphone button if not supported
    }


    sendButton.addEventListener('click', sendMessage);
    micButton.addEventListener('click', toggleSpeechInput);

    userInput.addEventListener('keypress', function(event) {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            sendMessage();
        }
    });

    userInput.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight) + 'px';
        chatBox.scrollTop = chatBox.scrollHeight;
    });

    function addMessage(type, content) {
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message', `${type}-message`);

        const avatarDiv = document.createElement('div');
        avatarDiv.classList.add('avatar', `${type}-avatar`);
        avatarDiv.textContent = (type === 'user') ? 'You' : 'AI';

        const contentDiv = document.createElement('div');
        contentDiv.classList.add('message-content');

        if (type === 'bot') {
            contentDiv.innerHTML = marked.parse(content);

            // *** NEW LOGIC FOR COPY BUTTONS ***
            // Use setTimeout to ensure DOM is updated and Prism has highlighted
            setTimeout(() => {
                Prism.highlightAllUnder(contentDiv); // Highlight only within this message

                // Find all <pre> elements (which contain <code> for code blocks)
                const codeBlocks = contentDiv.querySelectorAll('pre');

                codeBlocks.forEach(preBlock => {
                    const codeElement = preBlock.querySelector('code');
                    if (codeElement) {
                        const copyButton = document.createElement('button');
                        copyButton.classList.add('copy-button');
                        copyButton.textContent = 'Copy';
                        copyButton.title = 'Copy code to clipboard';

                        copyButton.addEventListener('click', () => {
                            // Use textContent to get the plain code without HTML
                            const codeToCopy = codeElement.textContent;
                            navigator.clipboard.writeText(codeToCopy).then(() => {
                                copyButton.textContent = 'Copied!';
                                copyButton.classList.add('copied');
                                setTimeout(() => {
                                    copyButton.textContent = 'Copy';
                                    copyButton.classList.remove('copied');
                                }, 2000); // Reset text after 2 seconds
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
                        preBlock.appendChild(copyButton); // Append button to the <pre> block
                    }
                });
            }, 0);
            // **********************************

        } else {
            contentDiv.textContent = content;
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
    }

    function removeInitialGreeting() {
        if (initialGreeting && !initialGreeting.classList.contains('hidden')) {
            initialGreeting.classList.add('hidden');
            initialGreeting.addEventListener('transitionend', () => {
                initialGreeting.remove();
            }, { once: true });
        }
    }

    // Function to toggle speech input
    function toggleSpeechInput() {
        if (micButton.classList.contains('listening')) {
            recognition.stop(); // Stop listening
        } else {
            userInput.value = ''; // Clear previous input
            // Removed: userInput.focus(); // No longer explicitly focus the input field
            recognition.start(); // Start listening
        }
    }

    // This function for text-to-speech is not directly used for the current request
    // function speakMessage(text) {
    //     if ('speechSynthesis' in window) {
    //         window.speechSynthesis.cancel();
    //         const utterance = new SpeechSynthesisUtterance(text);
    //         utterance.rate = 1.0;
    //         utterance.pitch = 1.0;
    //         window.speechSynthesis.speak(utterance);
    //     } else {
    //         console.warn("Web Speech API is not supported in this browser.");
    //     }
    // }

    async function sendMessage() {
        const message = userInput.value.trim();
        const selectedPersonality = personalitySelect.value;

        if (message === '') return;

        removeInitialGreeting();

        addMessage('user', message);
        userInput.value = '';
        userInput.style.height = 'auto';
        chatBox.scrollTop = chatBox.scrollHeight;

        typingIndicator.classList.add('visible');

        try {
            const response = await fetch('/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: message,
                    personality: selectedPersonality
                })
            });

            const data = await response.json();

            typingIndicator.classList.remove('visible');

            if (response.ok) {
                addMessage('bot', data.response);
                // speakMessage(data.response); // Uncomment if you want text-to-speech for AI responses
            } else {
                console.error('Server error:', data.error);
                addMessage('bot', `Error: ${data.error || 'Unknown server error.'}`);
            }
            chatBox.scrollTop = chatBox.scrollHeight;
        } catch (error) {
            console.error('Network or client-side error:', error);
            typingIndicator.classList.remove('visible');
            addMessage('bot', `Error: Could not connect to the AI server. (${error.message || error})`);
            chatBox.scrollTop = chatBox.scrollHeight;
        }
    }
});