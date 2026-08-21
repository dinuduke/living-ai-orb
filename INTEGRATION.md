# Integration Guide

Living AI Orb is dependency-free. Use it as a standalone page, embed it in another product, or connect its visual state to your existing voice stack.

## 1. Drop-in iframe

```html
<iframe
  src="/living-ai-orb/index.html"
  title="Interactive AI voice orb"
  style="width:100%;height:680px;border:0;background:#050505"
></iframe>
```

## 2. Built-in JavaScript API

After the page loads, `window.LivingAIOrb` is available:

```js
window.addEventListener("living-ai-orb-ready", () => {
  LivingAIOrb.setText("Hello. How can I help you today?");
  LivingAIOrb.speak();
});
```

Available methods:

```js
LivingAIOrb.setText("Text to speak");
LivingAIOrb.speak();
LivingAIOrb.stop();
LivingAIOrb.setSpeaking(true);
LivingAIOrb.setSpeaking(false);
LivingAIOrb.setPaletteShift();
```

## 3. Connect your own TTS or voice agent

If your application already plays assistant audio, use your existing lifecycle events to drive the orb:

```js
voiceAgent.on("assistant_speaking", () => {
  LivingAIOrb.setSpeaking(true);
});

voiceAgent.on("assistant_stopped", () => {
  LivingAIOrb.setSpeaking(false);
});
```

This works well with realtime voice systems, custom WebSocket services, TTS providers and agent frameworks.

For exact waveform-driven animation, route the assistant audio through a Web Audio `AnalyserNode` and map the measured amplitude to your visual state.

## 4. React / Next.js

The quickest integration is an iframe or a client-only wrapper around the existing page. For a native component, move the animation loop into `useEffect`, keep mutable animation values in refs, and cancel `requestAnimationFrame` during cleanup.

Example wrapper:

```jsx
export default function AIOrb() {
  return (
    <iframe
      src="/orb/index.html"
      title="AI voice orb"
      style={{ width: "100%", height: 700, border: 0 }}
    />
  );
}
```

## 5. Customization

Useful values in `orb.js`:

- `COUNT` — particle density
- `horizontalStretch` — horizontal morph intensity
- `waveAmount` — edge deformation
- `hue` / `hueTarget` — color family
- `talkEdge` and `talkHalo` — speaking glow
- pointer interaction radius/push — hover and touch response

## Browser requirements

- Canvas 2D
- Web Speech API for built-in text-to-speech
- Web Audio API for microphone reactivity
- Pointer Events for mouse, touch and pen interaction

Microphone access normally requires HTTPS or `localhost`.