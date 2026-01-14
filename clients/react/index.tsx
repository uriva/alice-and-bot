import { init as initAdmin, type InstantAdminDatabase } from "@instantdb/admin";
import { init, type InstantReactWebDatabase } from "@instantdb/react";
import { signal } from "@preact/signals";
import { coerce } from "@uri/gamla";
import { render } from "preact";
import { useState } from "preact/hooks";
import schema from "../../instant.schema.ts";
import {
  type Credentials,
  instantAppId,
} from "../../protocol/src/clientApi.ts";
import { registerPush } from "../../protocol/src/pushClient.ts";
import { Widget, type WidgetColorScheme } from "../../widget/src/widget.tsx";
import { useCredentials, useGetOrCreateConversation } from "./src/hooks.ts";
import { Chat } from "./src/main.tsx";

const widgetMode = signal(true);
const customScheme = signal<WidgetColorScheme>({
  dark: {
    primary: "#a855f7",
    buttonColor: "#7c3aed",
    buttonTextColor: "#ffffff",
    background: "#0b1021",
  },
});

const schemeChoice = signal<"default" | "custom">("custom");

const WithCredentials = (
  { participants, db, adminDb, initialMessage }: {
    participants: Credentials[];
    initialMessage?: string;
    db: () => InstantReactWebDatabase<typeof schema>;
    adminDb: () => InstantAdminDatabase<typeof schema>;
  },
) => {
  const ChatWithDb = Chat(db);
  const conversation = useGetOrCreateConversation(adminDb, db)({
    credentials: participants[0],
    initialMessage,
    participants: participants.map((p) => p.publicSignKey),
  });
  if (widgetMode.value) {
    return (
      <Widget
        onNameChosen={() => {}}
        credentials={participants[0]}
        participants={participants.map((x) => x.publicSignKey)}
        colorScheme={schemeChoice.value === "custom"
          ? customScheme.value
          : undefined}
      />
    );
  }
  return conversation
    ? (
      <div style={{ display: "flex", gap: 10, height: 850 }}>
        {participants.slice(0, widgetMode.value ? 1 : participants.length)
          .map((p) => (
            <ChatWithDb
              key={p.publicSignKey}
              credentials={p}
              conversationId={conversation}
            />
          ))}
      </div>
    )
    : <div>preparing conversation</div>;
};

const ColorPicker = () => {
  const [mode, setMode] = useState<"light" | "dark">("dark");
  const scheme = customScheme.value;
  const modeColors = scheme[mode] || {};

  const updateColor = (key: string, value: string) => {
    customScheme.value = {
      ...scheme,
      [mode]: { ...modeColors, [key]: value },
    };
  };

  const addMode = () => {
    const defaults = mode === "dark"
      ? {
        primary: "#a855f7",
        buttonColor: "#7c3aed",
        buttonTextColor: "#ffffff",
        background: "#0b1021",
      }
      : {
        primary: "#2563eb",
        buttonColor: "#2563eb",
        buttonTextColor: "#ffffff",
        background: "#f8fafc",
      };
    customScheme.value = { ...scheme, [mode]: defaults };
  };

  return (
    <div
      style={{
        padding: 16,
        background: "#f3f4f6",
        borderRadius: 8,
        marginBottom: 16,
        maxWidth: 600,
      }}
    >
      <div style={{ marginBottom: 12, fontWeight: "bold" }}>
        Custom Color Scheme
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button
          type="button"
          onClick={() => setMode("light")}
          style={{
            padding: "6px 12px",
            background: mode === "light" ? "#2563eb" : "#e5e7eb",
            color: mode === "light" ? "#fff" : "#000",
            border: "none",
            borderRadius: 4,
            cursor: "pointer",
          }}
        >
          Light
        </button>
        <button
          type="button"
          onClick={() => setMode("dark")}
          style={{
            padding: "6px 12px",
            background: mode === "dark" ? "#2563eb" : "#e5e7eb",
            color: mode === "dark" ? "#fff" : "#000",
            border: "none",
            borderRadius: 4,
            cursor: "pointer",
          }}
        >
          Dark
        </button>
        {modeColors && Object.keys(modeColors).length > 0
          ? (
            <button
              type="button"
              onClick={() => {
                const { [mode]: _, ...rest } = scheme;
                customScheme.value = rest;
              }}
              style={{
                padding: "6px 12px",
                background: "#ef4444",
                color: "#fff",
                border: "none",
                borderRadius: 4,
                cursor: "pointer",
              }}
            >
              Clear {mode}
            </button>
          )
          : (
            <button
              type="button"
              onClick={addMode}
              style={{
                padding: "6px 12px",
                background: "#10b981",
                color: "#fff",
                border: "none",
                borderRadius: 4,
                cursor: "pointer",
              }}
            >
              Add {mode}
            </button>
          )}
      </div>
      {!modeColors || Object.keys(modeColors).length === 0
        ? <div style={{ color: "#6b7280" }}>No {mode} colors set</div>
        : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, 1fr)",
              gap: 8,
            }}
          >
            {["primary", "background", "buttonColor", "buttonTextColor"].map((
              key,
            ) => (
              <label
                key={key}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                  fontSize: 13,
                }}
              >
                {key}
                <input
                  type="color"
                  value={(modeColors as Record<string, string>)[key] ||
                    "#000000"}
                  onInput={(e) => updateColor(key, e.currentTarget.value)}
                  style={{ width: "100%", height: 32, cursor: "pointer" }}
                />
              </label>
            ))}
          </div>
        )}
    </div>
  );
};

const Main = (
  { adminDb, db }: {
    adminDb: () => InstantAdminDatabase<typeof schema>;
    db: () => InstantReactWebDatabase<typeof schema>;
  },
) => {
  const alice = useCredentials("alice", "demo-alice");
  const bot = useCredentials("bot", "demo-bot");
  const eve = useCredentials("eve", "demo-eve");
  return !alice || !bot || !eve
    ? (
      <div>
        Preparing credentials
      </div>
    )
    : (
      <>
        <div style={{ padding: 16 }}>
          <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
            <button
              type="button"
              onClick={() => {
                widgetMode.value = !widgetMode.value;
              }}
              style={{
                padding: "8px 16px",
                background: "#2563eb",
                color: "#fff",
                border: "none",
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              toggle mode
            </button>
            <button
              type="button"
              onClick={() => {
                registerPush(alice).catch(console.error);
              }}
              style={{
                padding: "8px 16px",
                background: "#10b981",
                color: "#fff",
                border: "none",
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              enable push
            </button>
            <label
              style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              <input
                type="radio"
                checked={schemeChoice.value === "default"}
                onChange={() => schemeChoice.value = "default"}
              />
              default
            </label>
            <label
              style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              <input
                type="radio"
                checked={schemeChoice.value === "custom"}
                onChange={() => schemeChoice.value = "custom"}
              />
              custom
            </label>
          </div>
          {schemeChoice.value === "custom" && <ColorPicker />}
        </div>
        <WithCredentials
          adminDb={adminDb}
          db={db}
          participants={[alice, bot, eve]}
        />
      </>
    );
};

render(
  <Main
    adminDb={() =>
      initAdmin({ appId: instantAppId, schema }).asUser({ guest: true })}
    db={() => init({ appId: instantAppId, schema, devtool: false })}
  />,
  coerce(document.getElementById("root")),
);
