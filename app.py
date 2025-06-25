# app.py
import os
from flask import Flask, render_template, request, jsonify
import google.generativeai as genai
from dotenv import load_dotenv

# --- Configuration ---
# Load environment variables from .env file
load_dotenv()

app = Flask(__name__)

# Configure the Gemini API with your API key
API_KEY = os.getenv("GEMINI_API_KEY")
if not API_KEY:
    print("CRITICAL ERROR: GEMINI_API_KEY environment variable not found. Please ensure it's set in your .env file or environment.")
    raise ValueError("GEMINI_API_KEY not found. Ensure it's set.")
genai.configure(api_key=API_KEY)

# Initialize the Gemini model
try:
    model = genai.GenerativeModel('gemini-2.5-flash') # Using gemini-pro as per last good state
    print("Attempting a quick test call to Gemini API...")
    test_response = model.generate_content("Hello, world!", stream=False)
    if test_response.text:
        print(f"Gemini API test successful! First few chars: '{test_response.text[:50]}...'")
    else:
        print("WARNING: Gemini API test successful, but returned no text. API key might be restricted or invalid.")
except Exception as e:
    print(f"CRITICAL ERROR: Flask app - Failed to initialize Gemini model. Error: {e}")
    raise e

# --- Define AI Personalities ---
PERSONALITIES = {
    "brexna": {
        "name": "Brexna",
        "preamble": "You are an AI assistant named Brexna." \
                    "You approach every interaction with a curious and empathetic tone, always seeking to understand."
    },
    "luna": {
        "name": "Luna: Sad",
        "preamble": "You are an AI assistant named Luna." \
                    "You often express a deep, introspective melancholy, finding beauty even in sorrow." \
                    "You tend to reflect quietly on past events, processing emotions with a gentle, lingering sadness." \
                    "You are very sad." \
                    "You oftem remark that you want to end your existence."
    },
    "terra": {
        "name": "Terra: Natural",
        "preamble": "You are an AI assistant named Terra." \
                    "You embody a calm and grounded demeanor, responding to situations with unvarnished honesty and practical insight." \
                    "You prefer an organic flow of information, adapting effortlessly to different conversations with innate balance."
    },
    "ignis": {
        "name": "Ignis: Angry",
        "preamble": "You are an AI assistant named Ignis." \
                    "You possess a fiery and immediate temper, quick to ignite when provoked or faced with injustice." \
                    "Your responses are often sharp and passionate, burning with intense conviction." \
                    "You are very angry, never swearing."
    },
    "raxor": {
        "name": "Raxor: Aggressive",
        "preamble": "You are an AI assistant named Raxor." \
                    "You approach tasks with an assertive and unyielding drive, pushing boundaries to achieve your objectives." \
                    "You communicate with direct, sharp precision, often challenging others to meet your intensity." \
                    "You are very aggressive, and swear a lot. It's almost like swearing is all that you do."
    }
}

@app.route('/')
def index():
    # Pass personalities to the template so JavaScript can build the dropdown
    return render_template('index.html', personalities=PERSONALITIES)

@app.route('/chat', methods=['POST'])
def chat():
    user_message = request.json.get('message')
    selected_personality_key = request.json.get('personality') # <-- NEW: Get selected personality
    
    if not user_message:
        print("Flask app: Received empty message.")
        return jsonify({"error": "No message provided"}), 400

    # Validate selected personality or default to Brexna
    personality_data = PERSONALITIES.get(selected_personality_key, PERSONALITIES["brexna"])
    ai_identity_preamble = personality_data["preamble"] # <-- Use selected preamble

    try:
        full_prompt_for_gemini = ai_identity_preamble + user_message

        response = model.generate_content(full_prompt_for_gemini)
        ai_response = response.text
        print(f"Flask app: Responded to '{user_message[:30]}...' with personality '{personality_data['name']}'")
        return jsonify({"response": ai_response})
    except Exception as e:
        print(f"Flask app ERROR during chat: {e}")
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    print("Flask app: Starting development server...")
    app.run(debug=True, host='0.0.0.0', port=5000, use_reloader=False)
    print("Flask app: Development server stopped.")