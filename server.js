const { WebSocketServer } = require("ws");
const { AssemblyAI } = require("assemblyai");
const dotenv = require("dotenv");

dotenv.config();

const PORT = process.env.PORT || 3001;

const wss = new WebSocketServer({ port: PORT });

wss.on("connection", async (ws) => {
  console.log("Browser connected");

  const client = new AssemblyAI({
    apiKey: process.env.ASSEMBLYAI_API_KEY,
  });

  const transcriber = client.streaming.transcriber({
    sampleRate: 16_000,
    formatTurns: true,
  });

  transcriber.on("open", ({ id }) => {
    console.log(`AssemblyAI session opened: ${id}`);
  });

  transcriber.on("turn", (turn) => {
    if (!turn.transcript) return;
    const message_type = turn.is_final
      ? "FinalTranscript"
      : "PartialTranscript";

    ws.send(
      JSON.stringify({
        type: "transcript",
        text: turn.transcript,
        message_type,
      })
    );
  });

  transcriber.on("error", (err) => {
    console.error("AssemblyAI error:", err);
    ws.send(JSON.stringify({ type: "error", message: err.message }));
  });

  transcriber.on("close", (code, reason) => {
    console.log("AssemblyAI closed:", code, reason);
    ws.close();
  });

  await transcriber.connect();

  const ts = new TransformStream();
  ts.readable.pipeTo(transcriber.stream());
  const writer = ts.writable.getWriter();

  ws.on("message", async (message) => {
    if (message.toString() === "terminate") {
      console.log("Closing transcription session...");
      await transcriber.close();
      ws.close();
      return;
    }
    await writer.write(new Uint8Array(message));
  });

  ws.on("close", async () => {
    console.log("Browser disconnected");
    await transcriber.close();
  });
});

console.log(`Server running on port ${PORT}`);
