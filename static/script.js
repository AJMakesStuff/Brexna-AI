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
            // Automatically send the message after recognition
            sendMessage();
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
            recognition.start(); // Start listening
        }
    }

    function speakMessage(text) {
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
            
            // Clean the text for speech
            let cleanedText = text;

            // Remove common Markdown bullet points (*, -, +) at the start of a line
            // and replace them with nothing or a space to avoid "Asterisk"
            cleanedText = cleanedText.replace(/^(\*|\-|\+) /gm, ''); 
            
            // Remove bold/italic markers (e.g., **, __, *, _)
            // This regex captures the text inside the markers ($2) and replaces the whole match with just the captured text
            cleanedText = cleanedText.replace(/(\*\*|__|\*|_)([^\s].*?)\1/g, '$2');
            
            // Remove code block backticks (single or triple) and their content
            cleanedText = cleanedText.replace(/```[\s\S]*?```/g, ''); // Remove multi-line code blocks
            cleanedText = cleanedText.replace(/`([^`]+?)`/g, '$1'); // Remove inline code backticks, keep content

            // Remove heading hashes (e.g., #, ##)
            cleanedText = cleanedText.replace(/^(#+)\s*/gm, '');

            // Replace multiple newlines with a single space or period for better flow
            cleanedText = cleanedText.replace(/\n\n+/g, '. '); // Two or more newlines become period-space
            cleanedText = cleanedText.replace(/\n/g, ' ');    // Single newlines become space

            // Remove any extra spaces and trim leading/trailing whitespace
            cleanedText = cleanedText.replace(/\s+/g, ' ').trim();

            const utterance = new SpeechSynthesisUtterance(cleanedText);
            utterance.rate = 1.0;
            utterance.pitch = 1.0;
            window.speechSynthesis.speak(utterance);
        } else {
            console.warn("Web Speech API is not supported in this browser.");
        }
    }

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
                speakMessage(data.response); // Uncommented to enable text-to-speech for AI responses
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