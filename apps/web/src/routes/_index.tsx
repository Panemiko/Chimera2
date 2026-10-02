import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";

import { authClient } from "@/lib/auth-client";
import { queryClient, trpc } from "@/utils/trpc";

import type { Route } from "./+types/_index";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Rooms" }, { name: "description", content: "Create or open a game room" }];
}

export default function Home() {
  const navigate = useNavigate();
  const { data: session, isPending } = authClient.useSession();
  const [name, setName] = useState("");

  const rooms = useQuery(trpc.rooms.list.queryOptions());

  const createRoom = useMutation(
    trpc.rooms.create.mutationOptions({
      onSuccess: (room) => {
        setName("");
        queryClient.invalidateQueries({ queryKey: trpc.rooms.list.queryKey() });
        navigate(`/${room.id}`);
      },
    }),
  );

  async function signOut() {
    await authClient.signOut();
    navigate("/login");
  }

  useEffect(() => {
    if (!session && !isPending) {
      navigate("/login");
    }
  }, [session, isPending, navigate]);

  if (isPending) {
    return <div className="container mx-auto max-w-2xl px-4 py-6">Loading...</div>;
  }

  if (!session) {
    return null;
  }

  return (
    <div className="container mx-auto max-w-2xl px-4 py-6">
      <div className="mb-4 flex items-center gap-2">
        <h1 className="text-xl font-semibold">Rooms</h1>
        <span className="truncate text-sm text-muted-foreground">{session.user.email}</span>
        <button className="ml-auto rounded border px-2 py-0.5 text-sm" onClick={signOut}>
          Log out
        </button>
      </div>

      <form
        className="mb-6 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim() || createRoom.isPending) return;
          createRoom.mutate({ name: name.trim() });
        }}
      >
        <input
          className="flex-1 rounded border px-2 py-1"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="room name"
        />
        <button className="rounded border px-3 py-1" type="submit" disabled={createRoom.isPending}>
          New room
        </button>
      </form>
      {createRoom.isError && (
        <p className="mb-4 text-sm text-red-500">Could not create the room. Try again.</p>
      )}

      {rooms.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading rooms...</p>
      ) : rooms.data?.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No rooms yet. Create one above to start playing.
        </p>
      ) : (
        <ul className="space-y-2">
          {rooms.data?.map((room) => (
            <li key={room.id} className="flex items-center gap-2 rounded border p-2">
              <button
                className="flex-1 text-left text-sm font-medium"
                onClick={() => navigate(`/${room.id}`)}
              >
                {room.name}
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  {room.role}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
