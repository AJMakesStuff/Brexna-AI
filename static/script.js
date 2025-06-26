document.addEventListener('DOMContentLoaded', function() {
    const chatBox = document.getElementById('chat-box');
    const userInput = document.getElementById('user-input'); // This is now a textarea
    const sendButton = document.getElementById('send-button');
    const typingIndicator = document.getElementById('typing-indicator');
    const personalitySelect = document.getElementById('personality-select');
    const initialGreeting = document.getElementById('initial-greeting');

    // Event listeners for sending messages
    sendButton.addEventListener('click', sendMessage);

    // Modified keypress event for textarea
    userInput.addEventListener('keypress', function(event) {
        // If Enter is pressed WITHOUT Shift key, send the message
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault(); // Prevent default new line in textarea
            sendMessage();
        }
    });

    // Auto-resize textarea on input
    userInput.addEventListener('input', function() {
        this.style.height = 'auto'; // Reset height to recalculate
        this.style.height = (this.scrollHeight) + 'px'; // Set height to scroll height
        // Ensure chat box scrolls to bottom when textarea expands
        chatBox.scrollTop = chatBox.scrollHeight;
    });

    // Function to add a new message bubble to the chat box
    function addMessage(type, content) {
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message', `${type}-message`);

        const avatarDiv = document.createElement('div');
        avatarDiv.classList.add('avatar', `${type}-avatar`);
        avatarDiv.textContent = (type === 'user') ? 'You' : 'AI';

        const contentDiv = document.createElement('div');
        contentDiv.classList.add('message-content');
        // Use innerHTML for potentially formatted content (e.g., if AI sends markdown)
        // For now, keep textContent as AI only sends plain text, but good to note.
        contentDiv.textContent = content; 

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

    /**
     * Hides the initial "Hello" greeting message.
     */
    function removeInitialGreeting() {
        if (initialGreeting && !initialGreeting.classList.contains('hidden')) {
            initialGreeting.classList.add('hidden');
            // Optional: Remove the element after transition to clean up DOM
            initialGreeting.addEventListener('transitionend', () => {
                initialGreeting.remove();
            }, { once: true });
        }
    }

    /**
     * Converts text to speech using the Web Speech API.
     * @param {string} text The text to be spoken.
     */
    function speakMessage(text) {
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel(); // Stop any ongoing speech

            const utterance = new SpeechSynthesisUtterance(text);
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

        // Hide the initial greeting message when the first user message is sent
        removeInitialGreeting();

        addMessage('user', message);
        userInput.value = '';
        // Reset textarea height after sending message
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
                // speakMessage(data.response);
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