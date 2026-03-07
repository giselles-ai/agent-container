const endpoints = [
  "POST /agent-api/build",
  "POST /agent-api/run",
  "GET /agent-api/relay/[[...relay]]",
  "POST /agent-api/relay/[[...relay]]",
];

export default function Home() {
  return (
    <main
      style={{
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        maxWidth: "48rem",
        margin: "0 auto",
        padding: "4rem 1.5rem",
        lineHeight: 1.6,
      }}
    >
      <h1 style={{ fontSize: "2rem", marginBottom: "1rem" }}>
        cloud-chat-runner
      </h1>
      <p style={{ marginBottom: "1.5rem" }}>
        This app exposes the local build, run, and relay APIs used by
        `apps/minimum-demo`.
      </p>
      <ul>
        {endpoints.map((endpoint) => (
          <li key={endpoint}>{endpoint}</li>
        ))}
      </ul>
    </main>
  );
}
