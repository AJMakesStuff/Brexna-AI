const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../static/script.js'), 'utf8');
const speechFunctions = source.slice(source.indexOf('    function speakMessage('),
    source.indexOf('    function removeInitialGreeting('));

function setup() {
    const utterances = [];
    const calls = { restart: 0, stop: 0 };
    const context = vm.createContext({
        voiceSessionActive: true,
        playbackId: 0,
        window: { speechSynthesis: {
            cancel() {}, getVoices: () => [], speak: utterance => utterances.push(utterance)
        } },
        SpeechSynthesisUtterance: function(text) { this.text = text; },
        MAX_SPEECH_CHUNK_LENGTH: 2,
        localStorage: { getItem: () => null },
        ENABLE_MULTIPLE_PERSONALITIES_JS: false,
        modalVoiceSelectStandalone: { value: '' },
        stopSpeakingButton: { style: {} },
        micButton: { classList: { remove() {}, contains: () => false }, title: '' },
        recognition: { stop: () => calls.stop++, start: () => calls.restart++ },
        toggleSpeechInput: () => calls.restart++,
        console: { warn() {}, error() {} }
    });
    vm.runInContext(speechFunctions, context);
    return { context, calls, utterances };
}

test('spoken goodbye finishes every reply chunk before stopping the microphone', async () => {
    const { context, calls, utterances } = setup();
    const done = context.speakMessage('Goodbye and take care!', !context.isGoodbye('Okay, GOODBYE!'));
    assert.equal(calls.stop, 0);
    utterances[0].onend();
    assert.equal(calls.stop, 0);
    utterances[1].onend();
    await done;
    assert.equal(calls.stop, 1);
    assert.equal(calls.restart, 0);
    assert.equal(context.micButton.title, 'Speak your message');
});

test('ordinary replies resume listening', async () => {
    const { context, calls, utterances } = setup();
    const done = context.speakMessage('Hello there', !context.isGoodbye('Hello'));
    utterances[0].onend();
    await done;
    assert.equal(calls.restart, 1);
    assert.equal(calls.stop, 0);
});

test('goodbye detection accepts transcription variants and word boundaries', () => {
    const { context } = setup();
    for (const message of ['Goodbye.', 'Thanks, good bye!', 'Good-bye', 'Bye!', 'Bye bye']) {
        assert.equal(context.isGoodbye(message), true);
    }
    for (const message of ['Hello', 'goodbyes', 'goodbyeland']) {
        assert.equal(context.isGoodbye(message), false);
    }
});

test('late ordinary reply cannot restart a voice session ended by goodbye', async () => {
    const { context, calls, utterances } = setup();
    const done = context.speakMessage('Earlier reply', true);
    context.voiceSessionActive = false;
    utterances[0].onend();
    await done;
    assert.equal(calls.restart, 0);
});

test('cancelled playback callbacks cannot restart listening or queue more speech', async () => {
    const { context, calls, utterances } = setup();
    const done = context.speakMessage('Earlier reply with several chunks', true);
    context.playbackId++;
    utterances[0].onend();
    await done;
    assert.equal(calls.restart, 0);
    assert.equal(utterances.length, 1);
});

test('failed farewell playback leaves the microphone stopped', async () => {
    const { context, calls, utterances } = setup();
    const done = context.speakMessage('Goodbye!', false);
    utterances[0].onerror({ error: 'synthesis-failed' });
    await done;
    assert.equal(calls.stop, 1);
    assert.equal(calls.restart, 0);
});
