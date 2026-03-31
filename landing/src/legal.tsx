import { useClearViewportStyles } from "./useClearViewportStyles.ts";

export const Legal = () => {
  useClearViewportStyles();
  return (
    <div style={{ maxWidth: 700, margin: "0 auto", padding: 24 }}>
      <h1>Legal Notice</h1>
      <p>
        Welcome to Alice&amp;Bot. By using this chat service, you agree to the
        following terms:
      </p>

      <h2>Privacy & Encryption</h2>
      <p>
        All messages sent through Alice&amp;Bot are end-to-end encrypted. This
        means:
      </p>
      <ul>
        <li>
          <strong>No Message Access:</strong>{" "}
          Only you and your conversation partner(s) can read the content of your
          messages. The service operators and developers do <em>not</em>{" "}
          have access to your message contents.
        </li>
        <li>
          <strong>Encrypted Storage:</strong>{" "}
          Messages are stored in encrypted form on our servers. We cannot
          decrypt or read them.
        </li>
        <li>
          <strong>Metadata:</strong>{" "}
          While message contents are encrypted, certain metadata (such as
          timestamps or user identifiers) may be stored to enable the
          functioning of the service.
        </li>
      </ul>

      <h2>Service Terms</h2>
      <ul>
        <li>
          <strong>Usage:</strong>{" "}
          You are responsible for your use of Alice&amp;Bot and for any content
          you send. Please use the service respectfully and lawfully.
        </li>
        <li>
          <strong>Payment Rights:</strong>{" "}
          We retain the right to require payment for file attachments or for
          users sending large quantities of data.
        </li>
        <li>
          <strong>Disclaimer:</strong>{" "}
          Alice&amp;Bot is provided as-is, without warranties of any kind. The
          service may be updated or discontinued at any time.
        </li>
      </ul>

      <h2>Open Source & Self-Hosting</h2>
      <p>
        The entire Alice&amp;Bot codebase is open source. This means:
      </p>
      <ul>
        <li>
          <strong>Transparency:</strong>{" "}
          Anyone can inspect the code to verify our privacy claims and security
          implementation.
        </li>
        <li>
          <strong>Self-Hosting:</strong>{" "}
          You can run your own Alice&amp;Bot server if you prefer not to use our
          hosted service. All instructions and code are available on GitHub.
        </li>
        <li>
          <strong>No Lock-in:</strong>{" "}
          Your data belongs to you. You can export and move to your own server
          at any time.
        </li>
      </ul>

      <p>
        For questions or concerns, please contact the service administrators.
      </p>
    </div>
  );
};
