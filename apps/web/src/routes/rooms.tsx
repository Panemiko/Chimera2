import { useMutation } from "@tanstack/react-query";
import { useSubscription } from "@trpc/tanstack-react-query";
import { useState } from "react";

import { trpc } from "@/utils/trpc";

import type { Route } from "./+types/rooms";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Salas realtime" }];
}

type ChatMessage = {
  id: string;
  text: string;
  author: string;
  sentAt: string;
};

export default function Rooms() {
  const [roomId, setRoomId] = useState("lobby");
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const { status, error, reset } = useSubscription(
    trpc.room.onMessage.subscriptionOptions(
      { roomId },
      {
        onData: (envelope) => {
          const message = envelope.data;
          setMessages((prev) =>
            prev.some((m) => m.id === message.id) ? prev : [...prev.slice(-99), message],
          );
        },
      },
    ),
  );

  const sendMessage = useMutation(
    trpc.room.sendMessage.mutationOptions({
      onSuccess: () => setDraft(""),
    }),
  );

  function joinRoom(nextRoom: string) {
    setRoomId(nextRoom);
    setMessages([]);
    reset();
  }

  return (
    <div className="container mx-auto max-w-xl px-4 py-6">
      <h1 className="mb-4 text-xl font-semibold">Sala: {roomId}</h1>

      <div className="mb-4 flex gap-2">
        <input
          className="flex-1 rounded border px-2 py-1"
          value={roomId}
          onChange={(e) => setRoomId(e.target.value)}
          placeholder="nome da sala"
        />
        <button
          className="rounded border px-3 py-1"
          onClick={() => joinRoom(roomId.trim() || "lobby")}
        >
          Entrar
        </button>
      </div>

      <p className="mb-2 text-sm text-muted-foreground">
        Status WS: {status}
        {error ? ` (${error.message})` : ""}
      </p>

      <ul className="mb-4 h-64 space-y-1 overflow-y-auto rounded border p-2">
        {messages.map((m) => (
          <li key={m.id} className="text-sm">
            <span className="font-medium">{m.author}</span>: {m.text}
          </li>
        ))}
      </ul>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!draft.trim()) return;
          sendMessage.mutate({ roomId, text: draft.trim() });
        }}
      >
        <input
          className="flex-1 rounded border px-2 py-1"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="digite a mensagem"
        />
        <button className="rounded border px-3 py-1" disabled={sendMessage.isPending}>
          Enviar
        </button>
      </form>
    </div>
  );
}
