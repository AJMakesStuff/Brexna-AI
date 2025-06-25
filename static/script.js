document.addEventListener('DOMContentLoaded', function() {
    const chatBox = document.getElementById('chat-box');
    const userInput = document.getElementById('user-input');
    const sendButton = document.getElementById('send-button');
    const typingIndicator = document.getElementById('typing-indicator');
    const personalitySelect = document.getElementById('personality-select'); // <-- NEW: Get dropdown element

    // Event listeners for sending messages
    sendButton.addEventListener('click', sendMessage);
    userInput.addEventListener('keypress', function(event) {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            sendMessage();
        }
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
        const selectedPersonality = personalitySelect.value; // <-- NEW: Get selected personality value

        if (message === '') return;

        addMessage('user', message);
        userInput.value = '';
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
                    personality: selectedPersonality // <-- NEW: Send personality to backend
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