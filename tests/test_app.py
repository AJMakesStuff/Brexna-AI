import os
import json
import tempfile
import unittest
import uuid
from unittest.mock import Mock, patch
import requests
from app import app, database


class ChatTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        app.config.update(TESTING=True, DATABASE=self.directory.name + '/chat.db')
        self.client = app.test_client()
        self.body = dict(message='Hello', sessionId=str(uuid.uuid4()), personality='brexna', timezone='Australia/Brisbane')
        self.env = patch.dict(os.environ, {'GEMINI_API_KEY': 'test-key', 'GEMINI_MODEL': 'gemini-2.5-pro'})
        self.env.start()
        self.sleep = patch('app.time.sleep').start()
        self.addCleanup(patch.stopall)

    def tearDown(self):
        self.env.stop()
        self.directory.cleanup()

    def response(self, data=None):
        response = Mock(status_code=200)
        response.json.return_value = data or {'candidates': [{'content': {'parts': [{'text': 'Hello there'}]}, 'finishReason': 'STOP'}]}
        return response

    def test_page_and_health(self):
        self.assertEqual(self.client.get('/').status_code, 200)
        self.assertEqual(self.client.get('/health').json, {'status': 'ok'})

    def test_validation(self):
        for body in [None, [], {}, {**self.body, 'message': 3}, {**self.body, 'sessionId': 'bad'}, {**self.body, 'personality': []}]:
            self.assertEqual(self.client.post('/chat', json=body).status_code, 400)

    def test_missing_key(self):
        with patch.dict(os.environ, {'GEMINI_API_KEY': ''}):
            self.assertEqual(self.client.post('/chat', json=self.body).status_code, 503)

    @patch('app.requests.post')
    def test_history_and_isolation(self, post):
        post.return_value = self.response()
        self.assertEqual(self.client.post('/chat', json=self.body).json['response'], 'Hello there')
        self.client.post('/chat', json=self.body)
        payload = post.call_args.kwargs['json']
        self.assertEqual(post.call_args.args[0], 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent')
        self.assertEqual(post.call_args.kwargs['headers'], {'x-goog-api-key': 'test-key'})
        self.assertEqual([x['role'] for x in payload['contents'][:3]], ['user', 'model', 'user'])
        self.assertIn('+10:00', payload['systemInstruction']['parts'][0]['text'])
        self.client.post('/chat', json={**self.body, 'sessionId': str(uuid.uuid4())})
        self.assertEqual(post.call_args.kwargs['json']['contents'][0]['role'], 'user')
        self.assertEqual(len(post.call_args.kwargs['json']['contents']), 1)

    @patch('app.requests.post')
    def test_failures_do_not_save_history(self, post):
        post.side_effect = requests.Timeout()
        self.assertEqual(self.client.post('/chat', json=self.body).status_code, 504)
        post.side_effect = None
        post.return_value = self.response({'candidates': []})
        self.assertEqual(self.client.post('/chat', json=self.body).status_code, 502)
        post.return_value = self.response()
        post.return_value.status_code = 429
        self.assertEqual(self.client.post('/chat', json=self.body).status_code, 429)
        post.return_value = self.response()
        self.client.post('/chat', json={**self.body, 'timezone': 'Invalid/Zone'})
        self.assertEqual(len(post.call_args.kwargs['json']['contents']), 1)

    @patch('app.requests.post')
    def test_provider_errors_are_actionable(self, post):
        for status, expected in [(404, 'GEMINI_MODEL'), (401, 'denied access'),
                                 (403, 'denied access'), (400, 'rejected the request'),
                                 (503, 'temporarily unavailable')]:
            with self.subTest(status=status):
                post.return_value = self.response()
                post.return_value.status_code = status
                response = self.client.post('/chat', json=self.body)
                self.assertEqual(response.status_code, 502)
                self.assertIn(expected, response.json['error'])
                self.assertNotIn('test-key', response.json['error'])

    @patch('app.requests.post')
    def test_transient_failure_retries_and_saves_one_exchange(self, post):
        failed = self.response()
        failed.status_code = 503
        post.side_effect = [failed, requests.ConnectionError(), self.response()]
        result = self.client.post('/chat', json=self.body)
        self.assertEqual(result.status_code, 200)
        self.assertEqual(post.call_count, 3)
        self.assertEqual(self.sleep.call_count, 2)
        post.side_effect = None
        post.return_value = self.response()
        self.client.post('/chat', json=self.body)
        self.assertEqual(len(post.call_args.kwargs['json']['contents']), 3)

    @patch('app.requests.post')
    def test_retry_exhaustion_and_non_retryable_errors(self, post):
        post.return_value = self.response()
        post.return_value.status_code = 503
        result = self.client.post('/chat', json=self.body)
        self.assertIn('automatic retries', result.json['error'])
        self.assertEqual(post.call_count, 3)
        post.reset_mock()
        post.return_value.status_code = 403
        self.client.post('/chat', json=self.body)
        self.assertEqual(post.call_count, 1)
        post.return_value = self.response()
        self.client.post('/chat', json=self.body)
        self.assertEqual(len(post.call_args.kwargs['json']['contents']), 1)

    @patch('app.requests.post')
    def test_legacy_history_is_converted(self, post):
        import time
        db = database()
        with db:
            db.execute('INSERT INTO conversations VALUES (?, ?, ?)',
                       (self.body['sessionId'] + ':brexna', json.dumps([
                           {'role': 'user', 'parts': [{'text': 'Remember blue'}]},
                           {'role': 'model', 'parts': [{'text': 'Understood'}]}]), time.time()))
        db.close()
        post.return_value = self.response()
        self.assertEqual(self.client.post('/chat', json=self.body).status_code, 200)
        self.assertEqual(post.call_args.kwargs['json']['contents'][:2], [
            {'role': 'user', 'parts': [{'text': 'Remember blue'}]},
            {'role': 'model', 'parts': [{'text': 'Understood'}]}])

    @patch('app.requests.post')
    def test_blocked_response_and_thought_filter(self, post):
        post.return_value = self.response({'promptFeedback': {'blockReason': 'SAFETY'}})
        self.assertEqual(self.client.post('/chat', json=self.body).status_code, 502)
        post.return_value = self.response({'candidates': [{'content': {'parts': [
            {'text': 'Internal reasoning', 'thought': True}, {'text': 'Visible answer'}]}}]})
        self.assertEqual(self.client.post('/chat', json=self.body).json['response'], 'Visible answer')

    @patch('app.requests.post')
    def test_context_is_bounded(self, post):
        post.return_value = self.response()
        for _ in range(23):
            self.client.post('/chat', json=self.body)
        self.assertEqual(len(post.call_args.kwargs['json']['contents']), 41)


if __name__ == '__main__':
    unittest.main()
