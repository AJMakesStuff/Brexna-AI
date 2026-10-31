# Brexna

A standalone Flask chat website that calls Gemini directly. Includes selectable personalities, Markdown and code highlighting, microphone input, voice selection, and spoken replies to voice messages. Browser speech support varies; microphone access requires localhost or HTTPS.

## Docker

Get an API key from https://aistudio.google.com/apikey; do not paste it into browser code or chat.
Gemini model is set to `gemini-3.5-flash-lite` as it is a cheap, but semi-powerful model

Open `.env.example`, set `GEMINI_API_KEY`, rename to `.env` then run:

```sh
docker compose up --build -d
```

Open http://localhost:5000. Stop with `docker compose down`. The named volume preserves conversation context across container restarts; `docker compose down -v` deletes it.

## Local development

Use Python 3.12 or newer:

```sh
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
python app.py
```

Set `MULTIPLE_PERSON_BOOL=true` to enable all five personalities. `GEMINI_MODEL` selects the model (default: `gemini-3.5-flash-lite`); `DATABASE_PATH` optionally changes the SQLite location. Keys stay on the server. The removed model-listing utility contained a hard-coded key: revoke that key and configure a replacement. Keep any private `API Keys` file out of source control.

Each page load and personality change starts a new conversation. The server retains the last 20 exchanges per conversation, with inactive context removed after 24 hours on the next chat request. Reloading clears the visible chat, as in the original interface. No external workflow is required. Only functionality represented in this repository is included; no external workflow export was provided.

The default Docker port is bound to localhost. There is no user authentication; add access control before exposing it publicly. The health endpoint checks the web server, not Gemini credentials or quota.

## Tests

```sh
python -m unittest discover -s tests -v
```

Tests mock Gemini and do not consume API quota. API format: https://ai.google.dev/api/generate-content

After editing `.env`, run `docker compose up -d` to recreate the container with the updated environment. A container restart alone does not reload these values. If Gemini reports an unavailable model, set `GEMINI_MODEL` to a model available to your API project.

Temporary Gemini HTTP 500/502/503/504 errors and connection timeouts are retried up to three attempts with short backoff. Persistent outages still return an error; failed requests are not added to conversation history. A request can take roughly three and a half minutes if every attempt times out.
