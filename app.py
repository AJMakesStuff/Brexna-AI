"""Standalone Brexna web application."""
import datetime
import json
import os
from pathlib import Path
import sqlite3
import time
import uuid
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from dotenv import load_dotenv
from flask import Flask, jsonify, render_template, request
import requests

load_dotenv()
from personalities import ENABLE_MULTIPLE_PERSONALITIES, PERSONALITIES

app = Flask(__name__)
app.config.update(MAX_CONTENT_LENGTH=32768, DATABASE=os.getenv('DATABASE_PATH', 'data/chat.db'))


def generate_content(model, api_key, payload):
    """Retry transient provider failures, without logging credentials or chat text."""
    for attempt in range(3):
        try:
            response = requests.post(
                f'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent',
                headers={'x-goog-api-key': api_key}, json=payload, timeout=(10, 60))
        except (requests.Timeout, requests.ConnectionError):
            app.logger.warning('Gemini transport failure on attempt %s/3', attempt + 1)
            if attempt == 2:
                raise
        else:
            if response.status_code not in (500, 502, 503, 504):
                return response
            app.logger.warning('Gemini HTTP %s on attempt %s/3', response.status_code, attempt + 1)
            if attempt == 2:
                return response
            response.close()
        time.sleep(2 ** attempt)


def database():
    path = Path(app.config['DATABASE'])
    path.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(path, timeout=10)
    db.execute('CREATE TABLE IF NOT EXISTS conversations (id TEXT PRIMARY KEY, contents TEXT NOT NULL, updated REAL NOT NULL)')
    return db


@app.get('/')
def index():
    return render_template('index.html', personalities=PERSONALITIES,
        enable_multiple_personalities_str=str(ENABLE_MULTIPLE_PERSONALITIES).lower())


@app.get('/health')
def health():
    return jsonify(status='ok')


@app.post('/chat')
def chat():
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        return jsonify(error='A JSON object is required.'), 400
    message = body.get('message')
    if not isinstance(message, str) or not message.strip() or len(message) > 16000:
        return jsonify(error='Enter a message between 1 and 16,000 characters.'), 400
    try:
        session_id = str(uuid.UUID(body.get('sessionId', '')))
    except (ValueError, TypeError, AttributeError):
        return jsonify(error='A valid session ID is required.'), 400
    personality = body.get('personality', 'brexna')
    if not isinstance(personality, str) or personality not in PERSONALITIES:
        return jsonify(error='Unknown personality.'), 400
    timezone = body.get('timezone', 'UTC')
    try:
        local_tz = ZoneInfo(timezone) if isinstance(timezone, str) else ZoneInfo('UTC')
    except (ZoneInfoNotFoundError, ValueError):
        local_tz = ZoneInfo('UTC')
    api_key = os.getenv('GEMINI_API_KEY', '').strip()
    if not api_key:
        return jsonify(error='Set GEMINI_API_KEY on the server to enable chat.'), 503
    model = os.getenv('GEMINI_MODEL', 'gemini-2.5-pro')
    conversation_id = f'{session_id}:{personality}'
    now = datetime.datetime.now(datetime.timezone.utc)
    db = database()
    try:
        with db:
            db.execute('DELETE FROM conversations WHERE updated < ?', (now.timestamp() - 86400,))
        row = db.execute('SELECT contents FROM conversations WHERE id = ?', (conversation_id,)).fetchone()
        history = json.loads(row[0]) if row else []
        # Convert saved legacy conversations without losing their context.
        history = [{'role': 'assistant' if item['role'] == 'model' else item['role'],
                    'content': item.get('content', '\n'.join(part.get('text', '') for part in item.get('parts', [])))}
                   for item in history]
        contents = history + [{'role': 'user', 'content': message.strip()}]
        system = PERSONALITIES[personality]['preamble'] + '\nCurrent local date and time: ' + now.astimezone(local_tz).isoformat()
        response = generate_content(model, api_key,
            {'systemInstruction': {'parts': [{'text': system}]},
             'contents': [{'role': 'model' if item['role'] == 'assistant' else item['role'],
                           'parts': [{'text': item['content']}]} for item in contents]})
        if response.status_code == 429:
            return jsonify(error='The AI service is busy or its quota is exhausted. Try again later.'), 429
        if response.status_code == 404:
            return jsonify(error=f'Gemini model "{model}" is unavailable. Update GEMINI_MODEL in .env and recreate the Docker container with docker compose up -d.'), 502
        if response.status_code in (401, 403):
            return jsonify(error='Gemini denied access. Check the API key and its API restrictions or project permissions.'), 502
        if response.status_code == 400:
            return jsonify(error='Gemini rejected the request. Check that the API key is valid and the configured model supports text chat.'), 502
        if response.status_code >= 500:
            return jsonify(error='Gemini is temporarily unavailable after automatic retries. Your message was not saved; please send it again shortly.'), 502
        response.raise_for_status()
        data = response.json()
        candidates = data.get('candidates', [])
        candidate = candidates[0] if candidates else {}
        if data.get('promptFeedback', {}).get('blockReason') or candidate.get('finishReason') in ('SAFETY', 'RECITATION', 'PROHIBITED_CONTENT', 'BLOCKLIST'):
            return jsonify(error='Gemini could not answer this request. Try rephrasing your message.'), 502
        parts = candidate.get('content', {}).get('parts', [])
        answer = '\n'.join(part['text'] for part in parts
                           if isinstance(part.get('text'), str) and not part.get('thought')).strip()
        if not answer:
            return jsonify(error='The AI service returned no text. Try rephrasing your message.'), 502
        contents = contents + [{'role': 'assistant', 'content': answer}]
        with db:
            db.execute('INSERT OR REPLACE INTO conversations VALUES (?, ?, ?)',
                (conversation_id, json.dumps(contents[-40:]), now.timestamp()))
        return jsonify(response=answer)
    except requests.Timeout:
        return jsonify(error='The AI service timed out. Please try again.'), 504
    except requests.ConnectionError:
        return jsonify(error='Cannot connect to Gemini. Check the server internet connection.'), 502
    except (requests.RequestException, ValueError, KeyError, TypeError, AttributeError):
        return jsonify(error='Unable to get an AI response. Check the server API key and model configuration.'), 502
    finally:
        db.close()


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=int(os.getenv('PORT', '5000')))
